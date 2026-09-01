\set ON_ERROR_STOP on
begin;

create temp table mr5_billing_state(key text primary key,payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
('ff200000-0000-4000-8000-000000000001','authenticated','authenticated','leah-mr5-billing@example.invalid','',now(),now(),now()),
('ff200000-0000-4000-8000-000000000002','authenticated','authenticated','leah-mr5-billing-unactivated@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
('ff100000-0000-4000-8000-000000000001','LEAH MR5 Billing','leah-mr5-billing','ff200000-0000-4000-8000-000000000001'),
('ff100000-0000-4000-8000-000000000002','LEAH MR5 Unactivated','leah-mr5-unactivated','ff200000-0000-4000-8000-000000000002');
insert into public.workspace_members(workspace_id,user_id,role)
values
('ff100000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001','owner'),
('ff100000-0000-4000-8000-000000000002','ff200000-0000-4000-8000-000000000002','owner');

-- Billing mutation is service-only and audit data is not browser-readable.
do $$
begin
  if has_function_privilege('anon','public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)','EXECUTE') then
    raise exception 'anon can mutate LEAH billing entitlement';
  end if;
  if has_function_privilege('authenticated','public.leah_apply_billing_entitlement_event(uuid,text,text,text,timestamptz,text,text,jsonb)','EXECUTE') then
    raise exception 'authenticated can mutate LEAH billing entitlement';
  end if;
  if has_table_privilege('authenticated','public.leah_billing_events','SELECT') then
    raise exception 'authenticated can read internal LEAH billing audit rows';
  end if;
end $$;

-- Renew/grace/cancel cannot silently create an entitlement that was never activated.
do $$
begin
  begin
    perform public.leah_apply_billing_entitlement_event(
      'ff100000-0000-4000-8000-000000000002','stripe','evt-unactivated-renew','renew',
      clock_timestamp()+interval '30 days','sub_unactivated','cus_unactivated','{}'::jsonb
    );
    raise exception 'Renew created an unactivated LEAH entitlement';
  exception when others then
    if sqlerrm='Renew created an unactivated LEAH entitlement' then raise; end if;
    if sqlerrm not like '%LEAH_ENTITLEMENT_NOT_ACTIVATED%' then raise; end if;
  end;
  if exists(select 1 from public.leah_workspace_entitlements where workspace_id='ff100000-0000-4000-8000-000000000002') then
    raise exception 'Unactivated workspace received LEAH entitlement row';
  end if;
end $$;

-- Explicit activate creates the add-on entitlement but no price/catalog row.
insert into mr5_billing_state(key,payload)
values ('activate',public.leah_apply_billing_entitlement_event(
  'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-activate','activate',
  clock_timestamp()+interval '30 days','sub_leah_1','cus_leah_1','{"entitlement_key":"leahAiOs"}'::jsonb
));

do $$
declare r jsonb; e public.leah_workspace_entitlements%rowtype;
begin
  select payload into r from mr5_billing_state where key='activate';
  if r->>'status' <> 'active' or r->>'idempotent_replay' <> 'false' then raise exception 'Activate result mismatch'; end if;
  select * into e from public.leah_workspace_entitlements where workspace_id='ff100000-0000-4000-8000-000000000001';
  if e.status <> 'active' or e.entitlement_key <> 'leahAiOs' or e.source <> 'billing' then raise exception 'Activated entitlement truth mismatch'; end if;
  if e.billing_provider <> 'stripe' or e.billing_subscription_ref <> 'sub_leah_1' or e.billing_customer_ref <> 'cus_leah_1' then
    raise exception 'Billing source references mismatch';
  end if;
end $$;

-- Same provider event is idempotent only when its immutable facts match.
do $$
declare r jsonb;
begin
  r := public.leah_apply_billing_entitlement_event(
    'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-activate','activate',
    (select valid_until from public.leah_billing_events where provider='stripe' and provider_event_id='evt-leah-activate'),
    'sub_leah_1','cus_leah_1','{"ignored_retry_metadata":true}'::jsonb
  );
  if r->>'idempotent_replay' <> 'true' then raise exception 'Billing replay was not idempotent'; end if;

  begin
    perform public.leah_apply_billing_entitlement_event(
      'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-activate','cancel',null,
      'sub_leah_1','cus_leah_1','{}'::jsonb
    );
    raise exception 'Conflicting reuse of provider event id was accepted';
  exception when others then
    if sqlerrm='Conflicting reuse of provider event id was accepted' then raise; end if;
    if sqlerrm not like '%LEAH_BILLING_EVENT_CONFLICT%' then raise; end if;
  end;
end $$;

-- Configure quotas as a separate product/ops decision; no monetary price is involved.
update public.leah_workspace_entitlements
set concurrency_limit=2,included_monthly_tokens=1000,storage_bytes_limit=100000,
    ai_funding_mode='hybrid',included_monthly_deploys=2
where workspace_id='ff100000-0000-4000-8000-000000000001';

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('ff300000-0000-4000-8000-000000000001','ff100000-0000-4000-8000-000000000001','Billing Project','billing-project','ff200000-0000-4000-8000-000000000001');

insert into mr5_billing_state(key,payload)
values ('start',public.leah_start_execution(
  'ff100000-0000-4000-8000-000000000001','ff300000-0000-4000-8000-000000000001',
  'ff200000-0000-4000-8000-000000000001','billing-active-run','{}'::jsonb,'manual'
));
insert into mr5_billing_state(key,payload)
values ('claim',public.leah_claim_next_task('mr5-billing-worker',300));

insert into public.leah_access_sessions(workspace_id,user_id,token_hash,expires_at)
values ('ff100000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001',repeat('8',64),clock_timestamp()+interval '60 minutes');
insert into public.leah_handoff_tickets(workspace_id,user_id,code_hash,expires_at)
values ('ff100000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001',repeat('9',64),clock_timestamp()+interval '60 seconds');

insert into public.leah_schedules(workspace_id,project_id,name,cadence_seconds,enabled,input,next_run_at,created_by)
values ('ff100000-0000-4000-8000-000000000001','ff300000-0000-4000-8000-000000000001','Billing schedule',3600,true,'{}'::jsonb,clock_timestamp()+interval '1 hour','ff200000-0000-4000-8000-000000000001');

-- Create active reservations that must be released if billing authority is lost.
insert into mr5_billing_state(key,payload)
select 'tokens',public.leah_reserve_managed_tokens(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'billing-token-reservation',100,300
) from mr5_billing_state where key='claim';
insert into mr5_billing_state(key,payload)
select 'deploy',public.leah_reserve_deployment_for_task(
  (payload->>'id')::uuid,(payload->>'lease_token')::uuid,'billing-deploy-reservation','vercel',600
) from mr5_billing_state where key='claim';

-- Grace and renewal change access deterministically without revoking active sessions.
do $$
declare r jsonb;
begin
  r := public.leah_apply_billing_entitlement_event(
    'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-grace','grace',
    clock_timestamp()+interval '7 days','sub_leah_1','cus_leah_1','{}'::jsonb
  );
  if r->>'status' <> 'grace' then raise exception 'Grace did not set entitlement grace'; end if;
  if (select revoked_at from public.leah_access_sessions where token_hash=repeat('8',64)) is not null then
    raise exception 'Grace revoked an otherwise valid LEAH session';
  end if;

  r := public.leah_apply_billing_entitlement_event(
    'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-renew','renew',
    clock_timestamp()+interval '30 days','sub_leah_1','cus_leah_1','{}'::jsonb
  );
  if r->>'status' <> 'active' then raise exception 'Renew did not reactivate entitlement'; end if;
end $$;

-- Cancellation must revoke every active authority surface in one transaction.
insert into mr5_billing_state(key,payload)
values ('cancel',public.leah_apply_billing_entitlement_event(
  'ff100000-0000-4000-8000-000000000001','stripe','evt-leah-cancel','cancel',null,
  'sub_leah_1','cus_leah_1','{"reason":"subscription_deleted"}'::jsonb
));

do $$
declare r jsonb; eid uuid; tid uuid;
begin
  select payload into r from mr5_billing_state where key='cancel';
  if r->>'status' <> 'cancelled' then raise exception 'Cancel did not cancel entitlement'; end if;
  if (select status from public.leah_workspace_entitlements where workspace_id='ff100000-0000-4000-8000-000000000001') <> 'cancelled' then
    raise exception 'Entitlement row not cancelled';
  end if;
  if (select revoked_at from public.leah_access_sessions where token_hash=repeat('8',64)) is null then raise exception 'Cancel did not revoke LEAH session'; end if;
  if (select consumed_at from public.leah_handoff_tickets where code_hash=repeat('9',64)) is null then raise exception 'Cancel did not consume pending handoff'; end if;

  select (payload->'execution'->>'id')::uuid into eid from mr5_billing_state where key='start';
  select (payload->>'id')::uuid into tid from mr5_billing_state where key='claim';
  if (select status from public.leah_tasks where id=tid) <> 'cancelled' then raise exception 'Cancel did not terminate active task'; end if;
  if (select status from public.leah_executions where id=eid) <> 'cancelled' then raise exception 'Cancel did not terminate active execution'; end if;
  if exists(select 1 from public.leah_tasks where workspace_id='ff100000-0000-4000-8000-000000000001' and status='running') then raise exception 'Running LEAH task survived cancellation'; end if;
  if exists(select 1 from public.leah_schedules where workspace_id='ff100000-0000-4000-8000-000000000001' and enabled) then raise exception 'Enabled schedule survived cancellation'; end if;
  if exists(select 1 from public.leah_usage_reservations where workspace_id='ff100000-0000-4000-8000-000000000001' and status='reserved') then raise exception 'Token reservation survived cancellation'; end if;
  if exists(select 1 from public.leah_deployment_reservations where workspace_id='ff100000-0000-4000-8000-000000000001' and status='reserved') then raise exception 'Deployment reservation survived cancellation'; end if;
end $$;

-- A later explicit activation may restore entitlement, but old sessions/leases stay dead.
perform public.leah_apply_billing_entitlement_event(
  'ff100000-0000-4000-8000-000000000001','paypal','evt-leah-reactivate','activate',
  clock_timestamp()+interval '30 days','pp-leah-1','payer-leah-1','{}'::jsonb
);
insert into public.leah_access_sessions(workspace_id,user_id,token_hash,expires_at)
values ('ff100000-0000-4000-8000-000000000001','ff200000-0000-4000-8000-000000000001',repeat('7',64),clock_timestamp()+interval '60 minutes');

-- Refund is terminal access loss just like cancellation.
insert into mr5_billing_state(key,payload)
values ('refund',public.leah_apply_billing_entitlement_event(
  'ff100000-0000-4000-8000-000000000001','paypal','evt-leah-refund','refund',null,
  'pp-leah-1','payer-leah-1','{"refund":true}'::jsonb
));

do $$
declare r jsonb;
begin
  select payload into r from mr5_billing_state where key='refund';
  if r->>'status' <> 'cancelled' then raise exception 'Refund did not cancel LEAH entitlement'; end if;
  if (select revoked_at from public.leah_access_sessions where token_hash=repeat('7',64)) is null then raise exception 'Refund did not revoke reactivated session'; end if;
  if (select count(*) from public.leah_billing_events where workspace_id='ff100000-0000-4000-8000-000000000001') <> 6 then
    raise exception 'Billing audit event count mismatch';
  end if;
end $$;

rollback;
\echo 'LEAH BILLING LIFECYCLE CONTRACT: PASS'
