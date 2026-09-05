-- Replace the initial routing function so an approved paid request can continue,
-- while rejected/pending requests remain blocked.
create or replace function public.leah_route_provider_for_request(
  _workspace_id uuid,
  _logical_request_id uuid,
  _capability text default 'general',
  _estimated_input_tokens bigint default 0,
  _estimated_output_tokens bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _candidate record;
  _approval public.leah_ai_spend_approval_requests%rowtype;
  _estimated_cost bigint;
  _approval_id uuid;
  _tokens bigint := coalesce(_estimated_input_tokens,0)+coalesce(_estimated_output_tokens,0);
begin
  if _workspace_id is null or _logical_request_id is null then raise exception 'LEAH routing identifiers are required'; end if;
  if _tokens < 0 then raise exception 'Invalid estimated token usage'; end if;

  -- FREE first. The row lock plus decrement makes the configured free quota a real
  -- reservation instead of a race-prone informational counter.
  select b.provider, b.model, b.routing_priority, b.free_quota_remaining_tokens,
         b.paid_approval_required
  into _candidate
  from public.leah_workspace_provider_bindings b
  join public.leah_ai_model_catalog m on m.provider=b.provider and m.model=b.model and m.enabled
  where b.workspace_id=_workspace_id
    and b.status='active' and b.validation_status='valid' and b.routing_enabled
    and m.billing_class='free'
    and b.free_quota_remaining_tokens >= _tokens
    and (coalesce(_capability,'general')='general' or m.capabilities ? coalesce(_capability,'general'))
  order by b.routing_priority asc, b.free_quota_remaining_tokens desc, b.provider
  limit 1
  for update of b;

  if found then
    update public.leah_workspace_provider_bindings
    set free_quota_remaining_tokens=free_quota_remaining_tokens-_tokens,
        updated_at=clock_timestamp()
    where workspace_id=_workspace_id and provider=_candidate.provider and model=_candidate.model;
    return jsonb_build_object(
      'decision','route','provider',_candidate.provider,'model',_candidate.model,
      'billing_class','free','estimated_cost_micros',0,'approval_required',false,
      'reason','free_quota_first'
    );
  end if;

  select b.provider, b.model, b.routing_priority,
         case
           when m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null then null
           else ceil((coalesce(_estimated_input_tokens,0)::numeric*m.input_cost_micros_per_million)/1000000)
              + ceil((coalesce(_estimated_output_tokens,0)::numeric*m.output_cost_micros_per_million)/1000000)
         end::bigint as estimated_cost_micros,
         b.paid_approval_required
  into _candidate
  from public.leah_workspace_provider_bindings b
  join public.leah_ai_model_catalog m on m.provider=b.provider and m.model=b.model and m.enabled
  where b.workspace_id=_workspace_id
    and b.status='active' and b.validation_status='valid' and b.routing_enabled
    and m.billing_class='paid'
    and (coalesce(_capability,'general')='general' or m.capabilities ? coalesce(_capability,'general'))
  order by
    (m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null) asc,
    case when m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null then null else
      ceil((coalesce(_estimated_input_tokens,0)::numeric*m.input_cost_micros_per_million)/1000000)
      + ceil((coalesce(_estimated_output_tokens,0)::numeric*m.output_cost_micros_per_million)/1000000)
    end asc,
    b.routing_priority asc, b.provider
  limit 1;

  if not found then raise exception 'LEAH_NO_PROVIDER_AVAILABLE'; end if;
  _estimated_cost := _candidate.estimated_cost_micros;

  select * into _approval
  from public.leah_ai_spend_approval_requests a
  where a.workspace_id=_workspace_id
    and a.logical_request_id=_logical_request_id
    and a.provider=_candidate.provider
    and a.model=_candidate.model;

  if found and _approval.status='approved' then
    return jsonb_build_object(
      'decision','route','provider',_candidate.provider,'model',_candidate.model,
      'billing_class','paid','estimated_cost_micros',_estimated_cost,
      'approval_required',false,'approval_request_id',_approval.id,
      'reason','paid_ai_approved'
    );
  end if;

  if not _candidate.paid_approval_required then
    return jsonb_build_object(
      'decision','route','provider',_candidate.provider,'model',_candidate.model,
      'billing_class','paid','estimated_cost_micros',_estimated_cost,
      'approval_required',false,'reason','lowest_known_cost'
    );
  end if;

  insert into public.leah_ai_spend_approval_requests(
    workspace_id,logical_request_id,provider,model,
    estimated_input_tokens,estimated_output_tokens,estimated_cost_micros,
    reason,metadata
  ) values (
    _workspace_id,_logical_request_id,_candidate.provider,_candidate.model,
    _estimated_input_tokens,_estimated_output_tokens,_estimated_cost,
    'paid_provider_required',jsonb_build_object('capability',coalesce(_capability,'general'))
  )
  on conflict (workspace_id,logical_request_id,provider,model) do update
    set requested_at=clock_timestamp(),status='pending',resolved_at=null,resolved_by=null
  returning id into _approval_id;

  return jsonb_build_object(
    'decision','approval_required','provider',_candidate.provider,'model',_candidate.model,
    'billing_class','paid','estimated_cost_micros',_estimated_cost,
    'approval_required',true,'approval_request_id',_approval_id,
    'reason','paid_ai_requires_admin_owner_approval'
  );
end;
$$;

revoke all on function public.leah_route_provider_for_request(uuid,uuid,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.leah_route_provider_for_request(uuid,uuid,text,bigint,bigint) to service_role;

-- Notify again when a previously rejected/expired approval is re-opened.
drop trigger if exists leah_paid_ai_approval_notification on public.leah_ai_spend_approval_requests;
create trigger leah_paid_ai_approval_notification
after insert or update of status on public.leah_ai_spend_approval_requests
for each row
when (TG_OP = 'INSERT' or NEW.status='pending')
execute function public.leah_notify_paid_ai_approval();
