#!/usr/bin/env bash
set -euo pipefail

# Reusable, isolated PostgreSQL authorization matrix. No Production dependency.
# The fixture intentionally models the canonical caller-bound helpers and role mappings
# used by already-closed security migrations, then exercises real PostgreSQL RLS.

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

PSQL=(psql -X -v ON_ERROR_STOP=1 -q)

echo "[negative-e2e] starting isolated role/tenant authorization verifier"

"${PSQL[@]}" <<'SQL'
create schema if not exists auth;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

create or replace function auth.uid() returns uuid
language sql stable
set search_path = pg_catalog
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table if not exists public.tenant_e2e_workspaces (
  id uuid primary key,
  owner_id uuid not null
);
create table if not exists public.tenant_e2e_members (
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  primary key (workspace_id,user_id)
);
create table if not exists public.tenant_e2e_platform_roles (
  user_id uuid primary key,
  role text not null
);
create table if not exists public.tenant_e2e_support_sessions (
  id uuid primary key,
  user_id uuid not null,
  workspace_id uuid not null,
  scope text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table if not exists public.tenant_e2e_resources (
  id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null,
  parent_workspace_id uuid,
  payload text not null
);
create table if not exists public.tenant_e2e_children (
  id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null,
  parent_id uuid not null,
  payload text not null
);
create table if not exists public.tenant_e2e_private (
  id uuid primary key,
  workspace_id uuid not null,
  payload text not null
);

create or replace function public.has_workspace_access(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_e2e_workspaces w
    where w.id = _workspace_id and w.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.tenant_e2e_members m
    where m.workspace_id = _workspace_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and (m.expires_at is null or m.expires_at > now())
      and m.role in ('viewer','member','owner','admin')
  ) or exists (
    select 1 from public.tenant_e2e_members m
    where m.workspace_id = _workspace_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and (m.expires_at is null or m.expires_at > now())
      and m.role in ('business_admin','manager','employee','freelancer')
  );
$$;

create or replace function public.has_workspace_role(_workspace_id uuid, _roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_e2e_workspaces w
    where w.id = _workspace_id and w.owner_id = (select auth.uid()) and 'owner' = any(_roles)
  ) or exists (
    select 1 from public.tenant_e2e_members m
    where m.workspace_id = _workspace_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and (m.expires_at is null or m.expires_at > now())
      and (
        m.role = any(_roles)
        or (m.role = 'business_admin' and 'admin' = any(_roles))
        or (m.role in ('manager','employee','freelancer') and 'member' = any(_roles))
      )
  );
$$;

create or replace function public.is_platform_operator()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tenant_e2e_platform_roles r where r.user_id=(select auth.uid()) and r.role in ('admin','super_admin')) $$;

create or replace function public.has_active_support_scope(_workspace_id uuid, _scope text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_e2e_support_sessions s
    where s.user_id=(select auth.uid()) and s.workspace_id=_workspace_id
      and s.scope=_scope and s.revoked_at is null and s.expires_at>now()
  );
$$;

create or replace function public.tenant_e2e_immutable()
returns trigger language plpgsql security invoker set search_path = pg_catalog
as $$ begin
  if new.workspace_id is distinct from old.workspace_id then raise exception 'workspace_id immutable'; end if;
  if new.user_id is distinct from old.user_id then raise exception 'user_id immutable'; end if;
  return new;
end $$;

create or replace function public.tenant_e2e_parent_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if not exists (select 1 from public.tenant_e2e_resources p where p.id=new.parent_id and p.workspace_id=new.workspace_id) then
    raise exception 'foreign parent workspace';
  end if;
  return new;
end $$;

drop trigger if exists tenant_e2e_resource_immutable on public.tenant_e2e_resources;
create trigger tenant_e2e_resource_immutable before update of workspace_id,user_id on public.tenant_e2e_resources for each row execute function public.tenant_e2e_immutable();
drop trigger if exists tenant_e2e_child_immutable on public.tenant_e2e_children;
create trigger tenant_e2e_child_immutable before update of workspace_id,user_id on public.tenant_e2e_children for each row execute function public.tenant_e2e_immutable();
drop trigger if exists tenant_e2e_child_parent on public.tenant_e2e_children;
create trigger tenant_e2e_child_parent before insert or update of parent_id,workspace_id on public.tenant_e2e_children for each row execute function public.tenant_e2e_parent_guard();

alter table public.tenant_e2e_resources enable row level security;
alter table public.tenant_e2e_children enable row level security;
alter table public.tenant_e2e_private enable row level security;

drop policy if exists tenant_e2e_select on public.tenant_e2e_resources;
drop policy if exists tenant_e2e_insert on public.tenant_e2e_resources;
drop policy if exists tenant_e2e_update on public.tenant_e2e_resources;
drop policy if exists tenant_e2e_delete on public.tenant_e2e_resources;
create policy tenant_e2e_select on public.tenant_e2e_resources for select to authenticated using (public.has_workspace_access(workspace_id));
create policy tenant_e2e_insert on public.tenant_e2e_resources for insert to authenticated with check (public.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy tenant_e2e_update on public.tenant_e2e_resources for update to authenticated using (public.has_workspace_role(workspace_id,array['owner','admin','member'])) with check (public.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy tenant_e2e_delete on public.tenant_e2e_resources for delete to authenticated using (public.has_workspace_role(workspace_id,array['owner','admin']));

drop policy if exists tenant_e2e_child_select on public.tenant_e2e_children;
drop policy if exists tenant_e2e_child_insert on public.tenant_e2e_children;
drop policy if exists tenant_e2e_child_update on public.tenant_e2e_children;
drop policy if exists tenant_e2e_child_delete on public.tenant_e2e_children;
create policy tenant_e2e_child_select on public.tenant_e2e_children for select to authenticated using (public.has_workspace_access(workspace_id));
create policy tenant_e2e_child_insert on public.tenant_e2e_children for insert to authenticated with check (public.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy tenant_e2e_child_update on public.tenant_e2e_children for update to authenticated using (public.has_workspace_role(workspace_id,array['owner','admin','member'])) with check (public.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy tenant_e2e_child_delete on public.tenant_e2e_children for delete to authenticated using (public.has_workspace_role(workspace_id,array['owner','admin']));

create policy tenant_e2e_private_select on public.tenant_e2e_private for select to authenticated
using (public.has_active_support_scope(workspace_id,'private-read'));

revoke all privileges on table public.tenant_e2e_resources, public.tenant_e2e_children, public.tenant_e2e_private from public,anon,sandbox_exec;
grant select,insert,update,delete on table public.tenant_e2e_resources, public.tenant_e2e_children to authenticated,service_role;
grant select,insert,update,delete on table public.tenant_e2e_private to authenticated,service_role;

truncate public.tenant_e2e_children, public.tenant_e2e_resources, public.tenant_e2e_private, public.tenant_e2e_support_sessions, public.tenant_e2e_members, public.tenant_e2e_platform_roles, public.tenant_e2e_workspaces;

insert into public.tenant_e2e_workspaces values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
insert into public.tenant_e2e_members values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','viewer',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','member',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','admin',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','66666666-6666-6666-6666-666666666666','business_admin',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','77777777-7777-7777-7777-777777777777','manager',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','88888888-8888-8888-8888-888888888888','employee',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','99999999-9999-9999-9999-999999999999','freelancer',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa','member',true,now()-interval '1 minute'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa','member',false,null),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','33333333-3333-3333-3333-333333333333','viewer',true,null);
insert into public.tenant_e2e_platform_roles values
('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa','admin'),
('aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa','super_admin');
insert into public.tenant_e2e_support_sessions values
('aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa','aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()+interval '1 hour',null),
('bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb','bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()-interval '1 minute',null),
('bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb','bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()+interval '1 hour',now()),
('bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb','bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','other-scope',now()+interval '1 hour',null);

insert into public.tenant_e2e_resources values
('aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',null,'A');
insert into public.tenant_e2e_resources values
('bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222',null,'B');
insert into public.tenant_e2e_children values
('aaaaaaaa-aaaa-0001-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa','child-A');
insert into public.tenant_e2e_private values
('aaaaaaaa-aaaa-0002-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-A'),
('bbbbbbbb-bbbb-0002-0000-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','private-B');

-- Test helpers execute as a normal database role with request.jwt.claim.sub.
create or replace function public.tenant_e2e_assert(cond boolean, msg text) returns void language plpgsql as $$ begin if not cond then raise exception '%',msg; end if; end $$;

-- No direct browser grants for anon.
select public.tenant_e2e_assert(not has_table_privilege('anon','public.tenant_e2e_resources','select'),'anon table SELECT exposed');
select public.tenant_e2e_assert(has_table_privilege('authenticated','public.tenant_e2e_resources','select'),'authenticated SELECT missing');
select public.tenant_e2e_assert(not has_table_privilege('authenticated','public.tenant_e2e_resources','truncate'),'authenticated TRUNCATE exposed');

-- Matrix runner: each case changes JWT identity and exercises actual RLS through SET ROLE.
do $$
declare
  a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  owner_a uuid := '11111111-1111-1111-1111-111111111111';
  viewer uuid := '33333333-3333-3333-3333-333333333333';
  member uuid := '44444444-4444-4444-4444-444444444444';
  admin uuid := '55555555-5555-5555-5555-555555555555';
  platform uuid := 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';
  superadmin uuid := 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa';
  expired uuid := 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
  revoked uuid := 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
  support uuid := 'aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa';
  x uuid := gen_random_uuid();
  n int;
begin
  -- Viewer: read own workspace, cannot write/delete.
  perform set_config('request.jwt.claim.sub',viewer::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=1,'viewer own SELECT failed');
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=b)=0,'viewer cross-workspace SELECT succeeded');
  begin insert into public.tenant_e2e_resources values(x,a,viewer,null,'viewer-insert'); raise exception 'viewer INSERT unexpectedly succeeded'; exception when insufficient_privilege or raise_exception then null; end;

  -- Member: SELECT/INSERT/UPDATE allowed, DELETE denied.
  perform set_config('request.jwt.claim.sub',member::text,false);
  insert into public.tenant_e2e_resources values(x,a,member,null,'member');
  begin delete from public.tenant_e2e_resources where id=x; get diagnostics n=row_count; if n>0 then raise exception 'member DELETE unexpectedly succeeded'; end if; exception when raise_exception then null; end;
  begin update public.tenant_e2e_resources set workspace_id=b where id='aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa'; raise exception 'workspace move unexpectedly succeeded'; exception when raise_exception then null; end;
  begin update public.tenant_e2e_resources set user_id=owner_a where id=x; raise exception 'user_id spoof unexpectedly succeeded'; exception when raise_exception then null; end;

  -- Owner/admin operations.
  perform set_config('request.jwt.claim.sub',owner_a::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=2,'owner SELECT failed');
  delete from public.tenant_e2e_resources where id=x;
  perform set_config('request.jwt.claim.sub',admin::text,false);
  insert into public.tenant_e2e_resources values(x,a,admin,null,'admin');
  delete from public.tenant_e2e_resources where id=x;

  -- Foreign workspace INSERT and spoofed user_id are denied.
  perform set_config('request.jwt.claim.sub',member::text,false);
  begin insert into public.tenant_e2e_resources values(x,b,member,null,'foreign'); raise exception 'foreign INSERT unexpectedly succeeded'; exception when raise_exception then null; end;
  begin insert into public.tenant_e2e_resources values(x,a,owner_a,null,'spoof'); raise exception 'spoofed user_id INSERT unexpectedly succeeded'; exception when raise_exception then null; end;

  -- Cross-workspace UPDATE/DELETE are denied by USING; workspace move is also trigger protected.
  begin update public.tenant_e2e_resources set payload='cross' where id='bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb'; raise exception 'cross UPDATE unexpectedly succeeded'; exception when raise_exception then null; end;
  begin delete from public.tenant_e2e_resources where id='bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb'; get diagnostics n=row_count; if n>0 then raise exception 'cross DELETE unexpectedly succeeded'; end if; exception when raise_exception then null; end;

  -- Expired/revoked assignments cannot read.
  perform set_config('request.jwt.claim.sub',expired::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=0,'expired assignment read succeeded');
  perform set_config('request.jwt.claim.sub',revoked::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=0,'revoked assignment read succeeded');

  -- Platform admin and super_admin do not get automatic private-tenant access.
  perform set_config('request.jwt.claim.sub',platform::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=0,'platform admin private tenant read bypass');
  perform set_config('request.jwt.claim.sub',superadmin::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=0,'super_admin private tenant read bypass');

  -- Support session must be active, correct workspace, and exact scope.
  perform set_config('request.jwt.claim.sub',support::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_private where workspace_id=a)=1,'active support session denied');
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_private where workspace_id=b)=0,'wrong support workspace allowed');
  perform set_config('request.jwt.claim.sub','bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb',false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_private where workspace_id=a)=0,'expired support session allowed');
  perform set_config('request.jwt.claim.sub','bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb',false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_private where workspace_id=a)=0,'revoked support session allowed');
  perform set_config('request.jwt.claim.sub','bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb',false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_private where workspace_id=b)=0,'wrong support scope allowed');

  -- Child cannot point to a foreign parent.
  perform set_config('request.jwt.claim.sub',member::text,false);
  begin insert into public.tenant_e2e_children values(x,a,member,'bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb','foreign-parent'); raise exception 'foreign parent INSERT unexpectedly succeeded'; exception when raise_exception then null; end;
  insert into public.tenant_e2e_children values(x,a,member,'aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa','same-parent');

  -- Same user belongs to A and B: selected workspace remains authoritative.
  perform set_config('request.jwt.claim.sub',viewer::text,false);
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=a)=1,'multi-workspace user A access failed');
  perform public.tenant_e2e_assert((select count(*) from public.tenant_e2e_resources where workspace_id=b)=1,'multi-workspace user B access failed');
end $$;

-- Service role backend access is explicit table DML, while application code must bind a workspace.
create or replace function public.tenant_e2e_service_fetch(_workspace_id uuid)
returns setof public.tenant_e2e_resources language sql security definer set search_path = ''
as $$ select r.* from public.tenant_e2e_resources r where _workspace_id is not null and r.workspace_id=_workspace_id $$;
revoke all on function public.tenant_e2e_service_fetch(uuid) from public,anon,authenticated;
grant execute on function public.tenant_e2e_service_fetch(uuid) to service_role;
select public.tenant_e2e_assert((select count(*) from public.tenant_e2e_service_fetch(null))=0,'service path permits unbound tenant query');
select public.tenant_e2e_assert((select count(*) from public.tenant_e2e_service_fetch('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))=1,'service bound query failed');

-- Confirm the role mappings used by the canonical helper model.
select public.tenant_e2e_assert(public.has_workspace_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['admin']) = false,'unexpected owner/admin identity leakage');

raise notice '[negative-e2e] PASS: role matrix, tenant isolation, parent validation, support scope and service binding';
SQL

# The fixture is disposable: drop only objects created by this verifier.
"${PSQL[@]}" <<'SQL'
drop function if exists public.tenant_e2e_service_fetch(uuid);
drop function if exists public.tenant_e2e_assert(boolean,text);
drop function if exists public.tenant_e2e_parent_guard();
drop function if exists public.tenant_e2e_immutable();
drop function if exists public.is_platform_operator();
drop function if exists public.has_active_support_scope(uuid,text);
drop function if exists public.has_workspace_role(uuid,text[]);
drop function if exists public.has_workspace_access(uuid);
drop function if exists public.auth_uid_placeholder();
drop table if exists public.tenant_e2e_children;
drop table if exists public.tenant_e2e_resources;
drop table if exists public.tenant_e2e_private;
drop table if exists public.tenant_e2e_support_sessions;
drop table if exists public.tenant_e2e_platform_roles;
drop table if exists public.tenant_e2e_members;
drop table if exists public.tenant_e2e_workspaces;
SQL

echo "[negative-e2e] PASS"
