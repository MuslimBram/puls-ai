begin;

lock table public.ai_training_data in share row exclusive mode;

-- ai_training_data intentionally supports two semantic tiers:
--   * workspace_id IS NULL     => global/system training, backend only
--   * workspace_id IS NOT NULL => tenant training, workspace RLS
-- Do NOT make workspace_id NOT NULL.
alter table public.ai_training_data enable row level security;

create index if not exists idx_ai_training_data_workspace_active
  on public.ai_training_data(workspace_id, is_active, priority desc);

-- A row cannot change semantic tier or move between tenants after creation.
create or replace function public.enforce_ai_training_data_scope_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'ai_training_data workspace_id is immutable';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_ai_training_data_scope_immutability()
  from public, anon;
grant execute on function public.enforce_ai_training_data_scope_immutability()
  to authenticated, service_role;

drop trigger if exists trg_ai_training_data_scope_immutability
  on public.ai_training_data;
create trigger trg_ai_training_data_scope_immutability
before update of workspace_id on public.ai_training_data
for each row execute function public.enforce_ai_training_data_scope_immutability();

-- Remove legacy policies that exposed the global tier to every authenticated
-- browser and allowed standing platform admin/super_admin tenant bypasses.
drop policy if exists "training_read" on public.ai_training_data;
drop policy if exists "training_write" on public.ai_training_data;
drop policy if exists "training_update" on public.ai_training_data;
drop policy if exists "training_delete" on public.ai_training_data;

-- Least-privilege ACL. The browser may use tenant rows only through RLS.
-- Global rows remain reachable only to backend/service_role and the existing
-- bounded service_role-only global RPCs.
revoke all privileges on table public.ai_training_data
  from public, anon, authenticated, sandbox_exec, service_role;

grant select, insert, update, delete on table public.ai_training_data
  to authenticated, service_role;

create policy "ai_training_tenant_read"
on public.ai_training_data for select to authenticated
using (
  workspace_id is not null
  and public.has_workspace_access(workspace_id)
);

create policy "ai_training_tenant_insert"
on public.ai_training_data for insert to authenticated
with check (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "ai_training_tenant_update"
on public.ai_training_data for update to authenticated
using (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
)
with check (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "ai_training_tenant_delete"
on public.ai_training_data for delete to authenticated
using (
  workspace_id is not null
  and public.has_workspace_role(workspace_id, array['owner','admin'])
);

comment on table public.ai_training_data is
  'Two-tier AI training store: NULL workspace_id is global/system backend-only data; non-NULL workspace_id is tenant data protected by workspace RLS.';

commit;
