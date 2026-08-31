\set ON_ERROR_STOP on
begin;

-- This verifier is intended for an ephemeral/dev database after the LEAH migration.
-- It creates fixtures transactionally and rolls everything back.

insert into public.workspaces(id, owner_id)
values
  ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id, user_id, role)
values
  ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','owner'),
  ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values
  ('a1000000-0000-0000-0000-000000000001','active','test',2),
  ('b1000000-0000-0000-0000-000000000001','active','test',2);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A Project','a-project','a2000000-0000-0000-0000-000000000001'),
  ('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','B Project','b-project','b2000000-0000-0000-0000-000000000001');

-- Browser principal A: only workspace A rows must be visible.
set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000001',true);

do $$
declare
  _a_count integer;
  _b_count integer;
begin
  select count(*) into _a_count from public.leah_projects
    where id='a3000000-0000-0000-0000-000000000001';
  select count(*) into _b_count from public.leah_projects
    where id='b3000000-0000-0000-0000-000000000001';
  if _a_count <> 1 then raise exception 'Workspace A cannot read its own LEAH project'; end if;
  if _b_count <> 0 then raise exception 'Cross-workspace LEAH SELECT leak detected'; end if;

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

reset role;

-- Schema-level cross-workspace integrity: an artifact cannot point at a project
-- from another workspace even under a privileged migration/test role.
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
