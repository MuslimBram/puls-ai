-- MR7-A: BYOK attempt outcome and token usage must settle atomically.
-- cost_micros in leah_usage_events is Pulse/platform-funded cost; for BYOK it is 0.
-- Provider-side monetary cost is explicitly marked unknown unless separately reconciled.

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
  _usage jsonb := null;
  _event_key text;
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

  if _usage_source<>'unavailable' then
    if _input_tokens is null or _output_tokens is null then
      raise exception 'BYOK metered usage requires input and output tokens';
    end if;
    _event_key := 'provider-attempt:' || _attempt_id::text;
    _usage := public.leah_record_byok_usage_for_task(
      _task_id,_lease_token,_event_key,_attempt.provider,_attempt.model,
      _input_tokens,_output_tokens,0,
      coalesce(_metadata,'{}'::jsonb) || jsonb_build_object(
        'attempt_id',_attempt_id,
        'logical_request_id',_attempt.logical_request_id,
        'provider_request_id',_provider_request_id,
        'attempt_outcome',_outcome,
        'usage_source',_usage_source,
        'cost_semantics','pulse_platform_cost',
        'provider_billing_cost_status','unknown_unless_reconciled'
      )
    );
  end if;

  return jsonb_build_object('attempt',_finished,'usage',_usage);
end;
$$;

revoke all on function public.leah_finalize_byok_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,text,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.leah_finalize_byok_provider_attempt(uuid,uuid,uuid,text,text,text,bigint,bigint,bigint,text,integer,boolean,jsonb) to service_role;