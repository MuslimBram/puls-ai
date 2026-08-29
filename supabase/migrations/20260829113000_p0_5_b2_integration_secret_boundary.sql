begin;

lock table public.external_integrations, public.unified_connections in share row exclusive mode;

-- These resources are workspace-owned. Refuse to harden if any legacy row is unresolved.
do $$
begin
  if exists (select 1 from public.external_integrations where workspace_id is null) then
    raise exception 'Cannot enforce external_integrations.workspace_id: unresolved legacy rows remain';
  end if;
  if exists (select 1 from public.unified_connections where workspace_id is null) then
    raise exception 'Cannot enforce unified_connections.workspace_id: unresolved legacy rows remain';
  end if;
  if exists (
    select 1
    from public.unified_connections uc
    join public.business_profiles bp on bp.id = uc.business_id
    where uc.business_id is not null
      and bp.workspace_id <> uc.workspace_id
  ) then
    raise exception 'Cannot harden unified_connections: cross-workspace business link exists';
  end if;
end
$$;

alter table public.external_integrations alter column workspace_id set not null;
alter table public.unified_connections alter column workspace_id set not null;

-- Browser policies are removed because both tables contain credential-bearing columns.
drop policy if exists "Admins can view all external_integrations" on public.external_integrations;
drop policy if exists "Users can delete own external_integrations" on public.external_integrations;
drop policy if exists "Users can insert own external_integrations" on public.external_integrations;
drop policy if exists "Users can update own external_integrations" on public.external_integrations;
drop policy if exists "Users can view own external_integrations" on public.external_integrations;

drop policy if exists "Admins view all connections" on public.unified_connections;
drop policy if exists "Users manage own connections" on public.unified_connections;

revoke all privileges on table public.external_integrations from public, anon, authenticated, sandbox_exec;
revoke all privileges on table public.unified_connections from public, anon, authenticated, sandbox_exec;

-- Authenticated Edge Functions are the only application boundary for these rows.
revoke all privileges on table public.external_integrations from service_role;
grant select, insert, update, delete on table public.external_integrations to service_role;

revoke all privileges on table public.unified_connections from service_role;
grant select, insert, update, delete on table public.unified_connections to service_role;

commit;
