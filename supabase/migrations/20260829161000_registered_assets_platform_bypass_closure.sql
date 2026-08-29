begin;

lock table public.registered_assets in share row exclusive mode;

-- Fail closed on unexpected tenant-identity drift before changing access rules.
do $$
begin
  if exists (select 1 from public.registered_assets where workspace_id is null) then
    raise exception 'Cannot harden registered_assets: NULL workspace_id exists';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='registered_assets'
      and policyname='Admins can update assets'
  ) then
    raise exception 'Cannot harden registered_assets: expected legacy UPDATE policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='registered_assets'
      and policyname='Workspace members can view assets'
  ) then
    raise exception 'Cannot harden registered_assets: expected legacy SELECT policy is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='registered_assets'
      and policyname='Authenticated users can register assets'
  ) then
    raise exception 'Cannot harden registered_assets: expected legacy INSERT policy is missing';
  end if;
end
$$;

alter table public.registered_assets enable row level security;

create or replace function public.enforce_registered_assets_identity_immutability()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'registered_assets workspace_id is immutable';
  end if;
  if new.registered_by is distinct from old.registered_by then
    raise exception 'registered_assets registered_by is immutable';
  end if;
  return new;
end
$$;

revoke all on function public.enforce_registered_assets_identity_immutability()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_registered_assets_identity_immutability
  on public.registered_assets;
create trigger trg_registered_assets_identity_immutability
before update of workspace_id, registered_by on public.registered_assets
for each row execute function public.enforce_registered_assets_identity_immutability();

-- Remove standing platform/business-owner bypasses and the under-scoped INSERT.
drop policy if exists "Admins can update assets" on public.registered_assets;
drop policy if exists "Workspace members can view assets" on public.registered_assets;
drop policy if exists "Authenticated users can register assets" on public.registered_assets;

-- Least-privilege Data API ACL. RLS remains authoritative for authenticated users.
revoke all privileges on table public.registered_assets
  from public, anon, authenticated, sandbox_exec, service_role;
grant select, insert, update, delete on table public.registered_assets
  to authenticated, service_role;

create policy "registered_assets_select_workspace"
on public.registered_assets for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "registered_assets_insert_workspace"
on public.registered_assets for insert to authenticated
with check (
  registered_by = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "registered_assets_update_owner_admin"
on public.registered_assets for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

comment on table public.registered_assets is
  'Workspace-private registered assets. Reads require workspace access; inserts require workspace write access and self registered_by; updates require workspace owner/admin. Platform app roles do not bypass tenancy.';

commit;
