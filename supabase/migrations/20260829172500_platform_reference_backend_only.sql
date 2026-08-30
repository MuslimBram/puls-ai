begin;

lock table public.vault_secret_refs in share row exclusive mode;

do $$
begin
  if not exists(select 1 from public.vault_secret_refs) then
    raise exception 'Cannot harden vault_secret_refs: expected live global reference is missing';
  end if;
  if exists(select 1 from public.vault_secret_refs where workspace_id is not null) then
    raise exception 'Cannot harden vault_secret_refs: tenant-scoped rows appeared; review caller contract first';
  end if;
end
$$;

alter table public.vault_secret_refs enable row level security;

drop policy if exists "Workspace owners and admins can manage vault refs"
  on public.vault_secret_refs;

revoke all privileges on table public.vault_secret_refs
  from public,anon,authenticated,sandbox_exec,service_role;
grant select,insert,update,delete on table public.vault_secret_refs
  to service_role;

comment on table public.vault_secret_refs is
  'Backend-only references to protected provider credentials. Global rows may use workspace_id NULL; browser roles receive no direct Data API access.';

commit;
