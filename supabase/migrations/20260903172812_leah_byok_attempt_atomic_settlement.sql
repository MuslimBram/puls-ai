-- MR7-A: BYOK attempt outcome and token usage settle atomically.
-- Settlement is authorized by the attempt's originating lease token, even if that
-- lease has since expired. It records truth only; it cannot authorize a new provider call.
-- cost_micros in leah_usage_events means Pulse/platform-funded cost, so BYOK is 0.
-- Provider-side monetary cost remains explicitly unknown unless separately reconciled.

create or replace function public.leah_finalize_byok_provider_attempt(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _outcome text,
  _provider_request_id text default null,
  _usage_source text default 'unavailable',
  _input_tokens bigint default null,
  _output_tokens bigint default null,
  _total_tokens bigint default null,
  _error_code text default null,
  _latency_ms integer default null,
  _canonical_result boolean default false,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _attempt public.leah_provider_attempts%rowtype;
  _finished jsonb;
  _usage public.leah_usage_events%rowtype;
  _existing public.leah_usage_events%rowtype;
  _event_key text;
  _usage_json jsonb := null;
begin
  select a.* into _attempt
  from public.leah_provider_attempts a
  where a.attempt_id=_attempt_id
    and a.task_id=_task_id
    and a.authority_lease_token=_lease_token
  for update;
  if not found then raise exception 'Provider attempt not found'; end if;
  if _attempt.billing_mode<>'byok' then raise exception 'LEAH_PROVIDER_ATTEMPT_NOT_BYOK'; end if;

  _finished := public.leah_finish_provider_attempt(
    _task_id,_lease_token,_attempt_id,_outcome,_provider_request_id,_usage_source,
    _input_tokens,_output_tokens,_total_tokens,null,_error_code,_latency_ms,_canonical_result,
    coalesce(_metadata,'{}'::jsonb) || jsonb_build_object(
      'platform_cost_micros',0,
      'provider_billing_cost_status','unknown_unless_reconciled'
    )
  );

  -- leah_usage_events requires separate input/output counts. When the provider only
  -- exposes total or partial usage, the attempt ledger remains authoritative and we
  -- do not fabricate missing token components.
  if _usage_source<>'unavailable' and _input_tokens is not null and _output_tokens is not null then
    _event_key := 'provider-attempt:' || _attempt_id::text;
    select u.* into _existing
    from public.leah_usage_events u
    where u.workspace_id=_attempt.workspace_id and u.event_key=_event_key
    for update;

    if found then
      if _existing.execution_id is distinct from _attempt.execution_id
         or _existing.provider<>_attempt.provider
         or _existing.model<>_attempt.model
         or _existing.input_tokens<>_input_tokens
         or _existing.output_tokens<>_output_tokens
         or _existing.cost_micros<>0
         or _existing.funding_source<>'byok' then
        raise exception 'LEAH_USAGE_EVENT_CONFLICT';
      end if;
      _usage_json := to_jsonb(_existing) || jsonb_build_object('idempotent_replay',true);
    else
      insert into public.leah_usage_events(
        workspace_id,execution_id,event_key,provider,model,input_tokens,output_tokens,cost_micros,
        usage_type,quantity,funding_source,metadata
      ) values (
        _attempt.workspace_id,_attempt.execution_id,_event_key,_attempt.provider,_attempt.model,
        _input_tokens,_output_tokens,0,'model_tokens',_input_tokens+_output_tokens,'byok',
        coalesce(_metadata,'{}'::jsonb) || jsonb_build_object(
          'attempt_id',_attempt_id,
          'logical_request_id',_attempt.logical_request_id,
          'provider_request_id',_provider_request_id,
          'attempt_outcome',_outcome,
          'usage_source',_usage_source,
          'cost_semantics','pulse_platform_cost',
          'provider_billing_cost_status','unknown_unless_reconciled'
        )
      ) returning * into _usage;
      _usage_json := to_jsonb(_usage) || jsonb_build_object('idempotent_replay',false);
    end if;
  end if;

  return jsonb_build_object('attempt',_finished,'usage',_usage_json);
end;
$$;

revoke all on function public.leah_finalize_byok_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,text,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.leah_finalize_byok_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,text,integer,boolean,jsonb) to service_role;;
