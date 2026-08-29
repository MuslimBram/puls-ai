begin;

lock table public.n8n_configurations in share row exclusive mode;

-- Fail closed rather than guessing tenant or creator ownership.
do $$
begin
  if exists (select 1 from public.n8n_configurations where workspace_id is null) then
    raise exception 'Cannot harden n8n_configurations: unresolved workspace rows remain';
  end if;
  if exists (select 1 from public.n8n_configurations where user_id is null) then
    raise exception 'Cannot harden n8n_configurations: unresolved creator rows remain';
  end if;
end
$$;

alter table public.n8n_configurations enable row level security;
alter table public.n8n_configurations alter column workspace_id set not null;
alter table public.n8n_configurations alter column user_id set not null;

create index if not exists idx_n8n_configurations_workspace_updated
  on public.n8n_configurations(workspace_id, updated_at desc);

-- A configuration cannot be moved to another tenant or reassigned to another
-- creator, even when the same caller has elevated access in two workspaces.
create or replace function public.enforce_p0_5_b3b_n8n_identity_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'n8n_configurations workspace_id is immutable';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'n8n_configurations user_id is immutable';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_p0_5_b3b_n8n_identity_immutability() from public, anon;
grant execute on function public.enforce_p0_5_b3b_n8n_identity_immutability() to authenticated, service_role;

drop trigger if exists trg_p0_5_b3b_n8n_identity on public.n8n_configurations;
create trigger trg_p0_5_b3b_n8n_identity
before update of workspace_id, user_id on public.n8n_configurations
for each row execute function public.enforce_p0_5_b3b_n8n_identity_immutability();

-- Remove the legacy policy because it allowed global platform admin/super_admin
-- roles to bypass private workspace membership.
drop policy if exists "Workspace owners manage n8n config" on public.n8n_configurations;

-- Least-privilege table ACL. This is operational workspace metadata, not public
-- configuration. Browser access is RLS-bounded; service_role is backend DML-only.
revoke all privileges on table public.n8n_configurations
  from public, anon, authenticated, sandbox_exec, service_role;

grant select, insert, update, delete on table public.n8n_configurations
  to authenticated, service_role;

create policy "p0_5_b3b owners admins view n8n config"
on public.n8n_configurations for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_b3b owners admins insert n8n config"
on public.n8n_configurations for insert to authenticated
with check (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  and user_id = (select auth.uid())
);

create policy "p0_5_b3b owners admins update n8n config"
on public.n8n_configurations for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0_5_b3b owners admins delete n8n config"
on public.n8n_configurations for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

commit;
