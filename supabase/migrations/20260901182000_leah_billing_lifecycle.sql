-- MR5-C: deterministic provider-neutral billing lifecycle for the LEAH first-party add-on.
-- No price, Stripe product, PayPal plan or catalog mapping is created here.
-- Provider webhooks may invoke this only after they have independently resolved
-- workspace_id + entitlement_key='leahAiOs' from trusted provider metadata.

create table public.leah_billing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('stripe','paypal','manual')),
  provider_event_id text not null check (length(provider_event_id) between 1 and 255),
  entitlement_key text not null default 'leahAiOs' check (entitlement_key='leahAiOs'),
  lifecycle_action text not null check (lifecycle_action in ('activate','renew','grace','suspend','cancel','refund')),
  effective_status text not null check (effective_status in ('trial','active','grace','suspended','cancelled')),
  valid_until timestamptz null,
  provider_subscription_ref text null,
  provider_customer_ref text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (provider, provider_event_id),
  unique (id, workspace_id)
);
create index leah_billing_events_workspace_idx on public.leah_billing_events(workspace_id, created_at desc);

alter table public.leah_billing_events enable row level security;
alter table public.leah_billing_events force row level security;
revoke all on public.leah_billing_events from public, anon, authenticated;
grant all on public.leah_billing_events to service_role;

-- Source references are operational/audit metadata only; they do not contain prices.
alter table public.leah_workspace_entitlements
  add column billing_provider text null check (billing_provider is null or billing_provider in ('stripe','paypal','manual')),
  add column billing_subscription_ref text null,
  add column billing_customer_ref text null,
  add column last_billing_event_id uuid null,
  add constraint leah_entitlement_last_billing_event_fk
    foreign key (last_billing_event_id, workspace_id)
    references public.leah_billing_events(id, workspace_id)
    on delete set null (last_billing_event_id);

create or replace function public.leah_apply_billing_entitlement_event(
  _workspace_id uuid,
  _provider text,
  _provider_event_id text,
  _action text,
  _valid_until timestamptz default null,
  _provider_subscription_ref text default null,
  _provider_customer_ref text default null,
  _metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _existing public.leah_billing_events%rowtype;
  _event public.leah_billing_events%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _status text;
  _now timestamptz := clock_timestamp();
  _revoked_sessions integer := 0;
  _cancelled_tasks integer := 0;
  _cancelled_executions integer := 0;
begin
  if _workspace_id is null then raise exception 'workspace_id is required'; end if;
  if _provider not in ('stripe','paypal','manual') then raise exception 'Invalid billing provider'; end if;
  if _provider_event_id is null or length(trim(_provider_event_id)) < 1 or length(trim(_provider_event_id)) > 255 then
    raise exception 'Invalid billing event id';
  end if;
  if _action not in ('activate','renew','grace','suspend','cancel','refund') then raise exception 'Invalid LEAH billing action'; end if;
  if _provider_subscription_ref is not null and length(_provider_subscription_ref) > 500 then raise exception 'Invalid subscription reference'; end if;
  if _provider_customer_ref is not null and length(_provider_customer_ref) > 500 then raise exception 'Invalid customer reference'; end if;

  perform pg_advisory_xact_lock(hashtextextended('leah:billing:' || _workspace_id::text, 0));

  select * into _existing
  from public.leah_billing_events
  where provider=_provider and provider_event_id=trim(_provider_event_id);
  if found then
    if _existing.workspace_id <> _workspace_id
       or _existing.lifecycle_action <> _action
       or coalesce(_existing.valid_until,'infinity'::timestamptz) <> coalesce(_valid_until,'infinity'::timestamptz)
       or coalesce(_existing.provider_subscription_ref,'') <> coalesce(_provider_subscription_ref,'')
       or coalesce(_existing.provider_customer_ref,'') <> coalesce(_provider_customer_ref,'') then
      raise exception 'LEAH_BILLING_EVENT_CONFLICT';
    end if;
    return jsonb_build_object(
      'workspace_id', _existing.workspace_id,
      'event_id', _existing.id,
      'status', _existing.effective_status,
      'valid_until', _existing.valid_until,
      'idempotent_replay', true
    );
  end if;

  select * into _ent
  from public.leah_workspace_entitlements
  where workspace_id=_workspace_id
  for update;

  -- Entitlement rows are created only by an explicit activate event. Renew/grace/etc.
  -- cannot silently create a paid add-on that was never activated.
  if not found and _action <> 'activate' then
    raise exception 'LEAH_ENTITLEMENT_NOT_ACTIVATED';
  end if;

  _status := case _action
    when 'activate' then 'active'
    when 'renew' then 'active'
    when 'grace' then 'grace'
    when 'suspend' then 'suspended'
    when 'cancel' then 'cancelled'
    when 'refund' then 'cancelled'
  end;

  if _action in ('activate','renew','grace') and _valid_until is not null and _valid_until <= _now then
    raise exception 'Billing valid_until must be in the future';
  end if;

  insert into public.leah_billing_events(
    workspace_id, provider, provider_event_id, lifecycle_action, effective_status,
    valid_until, provider_subscription_ref, provider_customer_ref, metadata
  ) values (
    _workspace_id, _provider, trim(_provider_event_id), _action, _status,
    _valid_until, nullif(trim(coalesce(_provider_subscription_ref,'')),''),
    nullif(trim(coalesce(_provider_customer_ref,'')),''), coalesce(_metadata,'{}'::jsonb)
  ) returning * into _event;

  if _ent.workspace_id is null then
    insert into public.leah_workspace_entitlements(
      workspace_id, status, source, valid_until,
      billing_provider, billing_subscription_ref, billing_customer_ref,
      last_billing_event_id
    ) values (
      _workspace_id, _status, 'billing', _valid_until,
      _provider, nullif(trim(coalesce(_provider_subscription_ref,'')),''),
      nullif(trim(coalesce(_provider_customer_ref,'')),''), _event.id
    ) returning * into _ent;
  else
    update public.leah_workspace_entitlements e
    set status=_status,
        source='billing',
        valid_until=_valid_until,
        billing_provider=_provider,
        billing_subscription_ref=coalesce(nullif(trim(coalesce(_provider_subscription_ref,'')),''), e.billing_subscription_ref),
        billing_customer_ref=coalesce(nullif(trim(coalesce(_provider_customer_ref,'')),''), e.billing_customer_ref),
        last_billing_event_id=_event.id,
        updated_at=_now
    where e.workspace_id=_workspace_id
    returning * into _ent;
  end if;

  -- Suspension/cancellation/refund must stop authority immediately. Session resolver
  -- already rechecks entitlement on every request; revocation additionally removes
  -- any active handoff/session capability and active task lease in this transaction.
  if _action in ('suspend','cancel','refund') then
    update public.leah_access_sessions s
    set revoked_at=coalesce(s.revoked_at,_now)
    where s.workspace_id=_workspace_id and s.revoked_at is null;
    get diagnostics _revoked_sessions = row_count;

    update public.leah_sso_handoffs h
    set consumed_at=coalesce(h.consumed_at,_now)
    where h.workspace_id=_workspace_id and h.consumed_at is null;

    update public.leah_tasks t
    set status='cancelled',
        ended_at=_now,
        error=coalesce(t.error,jsonb_build_object('code','leah_entitlement_revoked','message','LEAH billing entitlement revoked')),
        lease_owner=null,
        lease_token=null,
        lease_expires_at=null,
        heartbeat_at=null,
        updated_at=_now
    where t.workspace_id=_workspace_id
      and t.status in ('queued','retry_wait','running');
    get diagnostics _cancelled_tasks = row_count;

    update public.leah_executions e
    set status='cancelled',
        ended_at=_now,
        error_code=coalesce(e.error_code,'leah_entitlement_revoked'),
        error_detail=coalesce(e.error_detail,jsonb_build_object('message','LEAH billing entitlement revoked')),
        updated_at=_now
    where e.workspace_id=_workspace_id
      and e.status in ('queued','running');
    get diagnostics _cancelled_executions = row_count;

    update public.leah_schedules s
    set enabled=false, updated_at=_now
    where s.workspace_id=_workspace_id and s.enabled=true;

    update public.leah_usage_reservations r
    set status='released', finalized_at=coalesce(r.finalized_at,_now)
    where r.workspace_id=_workspace_id and r.status='reserved';

    update public.leah_deploy_reservations r
    set status='released', finalized_at=coalesce(r.finalized_at,_now)
    where r.workspace_id=_workspace_id and r.status='reserved';
  end if;

  return jsonb_build_object(
    'workspace_id', _workspace_id,
    'event_id', _event.id,
    'status', _status,
    'valid_until', _valid_until,
    'revoked_sessions', _revoked_sessions,
    'cancelled_tasks', _cancelled_tasks,
    'cancelled_executions', _cancelled_executions,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)
  to service_role;
