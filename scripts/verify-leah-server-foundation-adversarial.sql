\set ON_ERROR_STOP on
begin;

-- Adversarial runtime verifier. This intentionally targets bugs that could pass
-- a simpler happy-path/source-contract test.

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('d2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-adv-owner@example.invalid','',now(),now(),now()),
  ('d2000000-0000-0000-0000-000000000002','authenticated','authenticated','leah-adv-member@example.invalid','',now(),now(),now()),
  ('e2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-adv-other@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
  ('d1000000-0000-0000-0000-000000000001','LEAH Adversarial D','leah-adv-d','d2000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001','LEAH Adversarial E','leah-adv-e','e2000000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values
  ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','owner'),
  ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','member'),
  ('e1000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001','owner');

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','D Project One','d-project-one','d2000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','D Project Two','d-project-two','d2000000-0000-0000-0000-000000000001'),
  ('e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','E Project','e-project','e2000000-0000-0000-0000-000000000001');

-- Same idempotency key MUST be valid in two projects of the same workspace.
insert into public.leah_executions(
  id,workspace_id,project_id,requested_by,idempotency_key
) values
  ('d7000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','same-client-key'),
  ('d7000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000001','same-client-key');

-- But a duplicate key in the SAME project must still fail.
do $$
begin
  begin
    insert into public.leah_executions(
      workspace_id,project_id,requested_by,idempotency_key
    ) values (
      'd1000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000001',
      'd2000000-0000-0000-0000-000000000001',
      'same-client-key'
    );
    raise exception 'Same-project idempotency duplicate succeeded';
  exception when unique_violation then null;
  end;
end $$;

-- Preferences: global is shared; private rows are visible only to their user.
insert into public.leah_preferences(id,workspace_id,user_id,scope,key,value,updated_by)
values
  ('d8000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001',null,'ui','global',jsonb_build_object('v','global'),'d2000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','ui','private',jsonb_build_object('v','owner'),'d2000000-0000-0000-0000-000000000001'),
  ('d8000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','ui','private',jsonb_build_object('v','member'),'d2000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub','d2000000-0000-0000-0000-000000000002',true);

do $$
declare
  _global integer;
  _mine integer;
  _owner_private integer;
begin
  select count(*) into _global from public.leah_preferences
    where id='d8000000-0000-0000-0000-000000000001';
  select count(*) into _mine from public.leah_preferences
    where id='d8000000-0000-0000-0000-000000000003';
  select count(*) into _owner_private from public.leah_preferences
    where id='d8000000-0000-0000-0000-000000000002';
  if _global <> 1 then raise exception 'Member cannot read workspace-global preference'; end if;
  if _mine <> 1 then raise exception 'Member cannot read own private preference'; end if;
  if _owner_private <> 0 then raise exception 'Member can read another user private preference'; end if;
end $$;

reset role;

-- Vault metadata composite FK: a LEAH registry row for workspace E may not point at
-- a vault_secret_refs row owned by workspace D.
insert into public.vault_secret_refs(id,workspace_id,integration_key,label,vault_secret_name,created_by)
values (
  'd9000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'leah:adversarial','LEAH adversarial metadata','leah_adversarial_metadata_only',
  'd2000000-0000-0000-0000-000000000001'
);

do $$
begin
  begin
    insert into public.leah_secret_registry(
      workspace_id,alias,provider,vault_ref_id,hint,created_by
    ) values (
      'e1000000-0000-0000-0000-000000000001',
      'cross-vault','verify-provider',
      'd9000000-0000-0000-0000-000000000001','••••FAIL',
      'e2000000-0000-0000-0000-000000000001'
    );
    raise exception 'Cross-workspace Vault metadata reference succeeded';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Session hashes must be real SHA-256 hex, not arbitrary strings.
do $$
begin
  begin
    insert into public.leah_access_sessions(workspace_id,user_id,token_hash,expires_at)
    values (
      'd1000000-0000-0000-0000-000000000001',
      'd2000000-0000-0000-0000-000000000001',
      'not-a-sha256', now() + interval '1 hour'
    );
    raise exception 'Invalid LEAH session hash accepted';
  exception when check_violation then null;
  end;
end $$;

-- Usage metering duplicate events must be rejected to prevent double charging.
insert into public.leah_usage_events(
  workspace_id,execution_id,event_key,provider,model,input_tokens,output_tokens,cost_micros
) values (
  'd1000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000001',
  'usage:one','verify','verify-model',10,5,100
);

do $$
begin
  begin
    insert into public.leah_usage_events(
      workspace_id,execution_id,event_key,provider,model,input_tokens,output_tokens,cost_micros
    ) values (
      'd1000000-0000-0000-0000-000000000001',
      'd7000000-0000-0000-0000-000000000001',
      'usage:one','verify','verify-model',10,5,100
    );
    raise exception 'Duplicate LEAH usage event accepted';
  exception when unique_violation then null;
  end;
end $$;

rollback;
\echo 'LEAH SERVER FOUNDATION ADVERSARIAL CONTRACT: PASS'
