\set ON_ERROR_STOP on
begin;

-- Runtime verifier for an ephemeral/dev database after both LEAH migrations.
-- All fixtures are transactional and are rolled back at the end.

insert into auth.users(
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('a2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-owner-a@example.invalid','',now(),now(),now()),
  ('b2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-owner-b@example.invalid','',now(),now(),now()),
  ('c2000000-0000-0000-0000-000000000001','authenticated','authenticated','leah-member-a@example.invalid','',now(),now(),now());

insert into public.workspaces(id, name, slug, owner_id)
values
  ('a1000000-0000-0000-0000-000000000001','LEAH Verify A','leah-verify-a','a2000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001','LEAH Verify B','leah-verify-b','b2000000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id, user_id, role)
values
  ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','owner'),
  ('a1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','member'),
  ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values
  ('a1000000-0000-0000-0000-000000000001','active','test',2),
  ('b1000000-0000-0000-0000-000000000001','active','test',2);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A Project','a-project','a2000000-0000-0000-0000-000000000001'),
  ('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','B Project','b-project','b2000000-0000-0000-0000-000000000001');

-- Metadata-only secret fixture; no Vault plaintext is required for RLS proof.
insert into public.leah_secret_registry(
  id, workspace_id, alias, provider, hint, created_by
) values (
  'a4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'verify-key','verify-provider','••••TEST',
  'a2000000-0000-0000-0000-000000000001'
);

-- OWNER A: own workspace visible, B invisible; secret metadata visible to owner.
set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000001',true);

do $$
declare
  _a_count integer;
  _b_count integer;
  _secret_count integer;
begin
  select count(*) into _a_count from public.leah_projects
    where id='a3000000-0000-0000-0000-000000000001';
  select count(*) into _b_count from public.leah_projects
    where id='b3000000-0000-0000-0000-000000000001';
  select count(*) into _secret_count from public.leah_secret_registry
    where id='a4000000-0000-0000-0000-000000000001';

  if _a_count <> 1 then raise exception 'Workspace A owner cannot read own LEAH project'; end if;
  if _b_count <> 0 then raise exception 'Cross-workspace LEAH SELECT leak detected'; end if;
  if _secret_count <> 1 then raise exception 'Workspace owner cannot read own LEAH secret metadata'; end if;

  if has_table_privilege('authenticated','public.leah_projects','INSERT') then
    raise exception 'authenticated unexpectedly has LEAH project INSERT';
  end if;
  if has_table_privilege('authenticated','public.leah_projects','UPDATE') then
    raise exception 'authenticated unexpectedly has LEAH project UPDATE';
  end if;
  if has_table_privilege('authenticated','public.leah_projects','DELETE') then
    raise exception 'authenticated unexpectedly has LEAH project DELETE';
  end if;
  if has_table_privilege('authenticated','public.leah_access_sessions','SELECT') then
    raise exception 'authenticated can read LEAH session hashes';
  end if;
end $$;

-- Actual direct-write attempt must fail, not merely a textual/grant assertion.
do $$
begin
  begin
    insert into public.leah_projects(workspace_id,name,slug,created_by)
    values (
      'a1000000-0000-0000-0000-000000000001',
      'Browser Forgery','browser-forgery',
      'a2000000-0000-0000-0000-000000000001'
    );
    raise exception 'authenticated direct LEAH INSERT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- MEMBER A: shared project state is readable, admin-only entitlement/secret metadata is not.
set local role authenticated;
select set_config('request.jwt.claim.sub','c2000000-0000-0000-0000-000000000001',true);

do $$
declare
  _project_count integer;
  _entitlement_count integer;
  _secret_count integer;
begin
  select count(*) into _project_count from public.leah_projects
    where id='a3000000-0000-0000-0000-000000000001';
  select count(*) into _entitlement_count from public.leah_workspace_entitlements
    where workspace_id='a1000000-0000-0000-0000-000000000001';
  select count(*) into _secret_count from public.leah_secret_registry
    where workspace_id='a1000000-0000-0000-0000-000000000001';

  if _project_count <> 1 then raise exception 'Workspace member cannot read shared LEAH project'; end if;
  if _entitlement_count <> 0 then raise exception 'Workspace member can read admin-only LEAH entitlement'; end if;
  if _secret_count <> 0 then raise exception 'Workspace member can read LEAH secret metadata'; end if;
end $$;

-- Browser cannot forge semantic status directly.
do $$
begin
  begin
    update public.leah_semantic_memory set status='embedded'
    where false;
    raise exception 'authenticated direct semantic UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Schema-level cross-workspace integrity: artifact cannot point at project from B.
do $$
begin
  begin
    insert into public.leah_project_artifacts(
      workspace_id,project_id,kind,path,content,created_by
    ) values (
      'b1000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000001',
      'code','src/cross-tenant.ts','blocked',
      'b2000000-0000-0000-0000-000000000001'
    );
    raise exception 'Composite FK failed: cross-workspace artifact insert succeeded';
  exception
    when foreign_key_violation then null;
  end;
end $$;

-- Composite self-reference hardening: deleting superseded artifact must null only
-- supersedes_id, never the NOT NULL workspace_id.
insert into public.leah_project_artifacts(
  id,workspace_id,project_id,kind,path,content,version,created_by
) values (
  'a5000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'code','src/versioned.ts','v1',1,
  'a2000000-0000-0000-0000-000000000001'
);
insert into public.leah_project_artifacts(
  id,workspace_id,project_id,kind,path,content,version,supersedes_id,created_by
) values (
  'a5000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'code','src/versioned.ts','v2',2,
  'a5000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001'
);
delete from public.leah_project_artifacts
where id='a5000000-0000-0000-0000-000000000001';

do $$
declare
  _workspace uuid;
  _supersedes uuid;
begin
  select workspace_id, supersedes_id into _workspace, _supersedes
  from public.leah_project_artifacts
  where id='a5000000-0000-0000-0000-000000000002';
  if _workspace <> 'a1000000-0000-0000-0000-000000000001' then
    raise exception 'Composite SET NULL corrupted workspace_id';
  end if;
  if _supersedes is not null then raise exception 'supersedes_id was not nulled'; end if;
end $$;

-- Browser roles must never execute Vault plaintext functions.
do $$
begin
  if has_function_privilege('anon','public.leah_vault_create(uuid,uuid,text,text,text)','execute') then
    raise exception 'anon can execute leah_vault_create';
  end if;
  if has_function_privilege('authenticated','public.leah_vault_create(uuid,uuid,text,text,text)','execute') then
    raise exception 'authenticated can execute leah_vault_create';
  end if;
  if has_function_privilege('authenticated','public.leah_vault_read_for_runtime(uuid,uuid,uuid,uuid)','execute') then
    raise exception 'authenticated can execute LEAH runtime secret read';
  end if;
  if has_function_privilege('authenticated','public.leah_vault_rotate(uuid,uuid,uuid,text)','execute') then
    raise exception 'authenticated can execute LEAH vault rotate';
  end if;
  if has_function_privilege('authenticated','public.leah_vault_revoke(uuid,uuid,uuid)','execute') then
    raise exception 'authenticated can execute LEAH vault revoke';
  end if;
  if not has_function_privilege('service_role','public.leah_vault_create(uuid,uuid,text,text,text)','execute') then
    raise exception 'service_role cannot execute LEAH vault create';
  end if;
  if not has_function_privilege('service_role','public.leah_vault_read_for_runtime(uuid,uuid,uuid,uuid)','execute') then
    raise exception 'service_role cannot execute LEAH runtime secret read';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leah_secret_registry'
      and column_name in ('ciphertext','plaintext','secret_value','iv')
  ) then
    raise exception 'LEAH secret registry contains secret material';
  end if;
end $$;

-- Idempotency uniqueness is a hard DB boundary.
insert into public.leah_executions(
  workspace_id,project_id,requested_by,idempotency_key
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'verify-idempotency'
);

do $$
begin
  begin
    insert into public.leah_executions(
      workspace_id,project_id,requested_by,idempotency_key
    ) values (
      'a1000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000001',
      'a2000000-0000-0000-0000-000000000001',
      'verify-idempotency'
    );
    raise exception 'LEAH idempotency uniqueness failed';
  exception
    when unique_violation then null;
  end;
end $$;

-- Semantic memory must not pretend to be embedded before a real vector adapter runs.
insert into public.leah_semantic_memory(workspace_id,project_id,source_ref,chunk)
values (
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'verify','hello semantic memory'
);

do $$
begin
  if exists (
    select 1 from public.leah_semantic_memory
    where workspace_id='a1000000-0000-0000-0000-000000000001'
      and source_ref='verify' and status <> 'pending'
  ) then
    raise exception 'Semantic memory falsely reports embedded state';
  end if;
end $$;

rollback;
\echo 'LEAH SERVER FOUNDATION CONTRACT: PASS'
