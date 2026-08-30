\set ON_ERROR_STOP on
create schema auth;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'sandbox_exec') then create role sandbox_exec nologin; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable set search_path=pg_catalog as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.e2e_ws(id uuid primary key,owner_id uuid not null);
create table public.e2e_member(ws uuid,user_id uuid,role text,active boolean default true,expires_at timestamptz,primary key(ws,user_id));
create table public.e2e_platform(user_id uuid primary key,role text not null);
create table public.e2e_support(id uuid primary key,user_id uuid,ws uuid,scope text,expires_at timestamptz,revoked_at timestamptz);
create table public.e2e_resource(id uuid primary key,ws uuid not null,user_id uuid not null,payload text not null);
create table public.e2e_child(id uuid primary key,ws uuid not null,user_id uuid not null,parent_id uuid not null);
create table public.e2e_private(id uuid primary key,ws uuid not null,payload text not null);

create or replace function public.has_workspace_access(w uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.e2e_ws x where x.id=w and x.owner_id=(select auth.uid())) or exists(select 1 from public.e2e_member m where m.ws=w and m.user_id=(select auth.uid()) and m.active and (m.expires_at is null or m.expires_at>now()) and m.role in('viewer','member','admin','owner','business_admin','manager','employee','freelancer')) $$;
create or replace function public.has_workspace_role(w uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.e2e_ws x where x.id=w and x.owner_id=(select auth.uid()) and 'owner'=any(roles)) or exists(select 1 from public.e2e_member m where m.ws=w and m.user_id=(select auth.uid()) and m.active and (m.expires_at is null or m.expires_at>now()) and (m.role=any(roles) or (m.role='business_admin' and 'admin'=any(roles)) or (m.role in('manager','employee','freelancer') and 'member'=any(roles)))) $$;
create or replace function public.has_active_support_scope(w uuid,s text) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.e2e_support x where x.user_id=(select auth.uid()) and x.ws=w and x.scope=s and x.revoked_at is null and x.expires_at>now()) $$;
create or replace function public.e2e_assert(ok boolean,msg text) returns void language plpgsql as $$ begin if not ok then raise exception '%',msg; end if; end $$;
create or replace function public.e2e_assert_denied(q text) returns void language plpgsql security invoker as $$ begin execute q; raise exception 'UNEXPECTED_SUCCESS'; exception when others then if sqlerrm='UNEXPECTED_SUCCESS' then raise; end if; end $$;
create or replace function public.e2e_immutable() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$ begin if new.ws is distinct from old.ws then raise exception 'workspace immutable'; end if; if new.user_id is distinct from old.user_id then raise exception 'user immutable'; end if; return new; end $$;
create or replace function public.e2e_parent_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin if not exists(select 1 from public.e2e_resource p where p.id=new.parent_id and p.ws=new.ws) then raise exception 'foreign parent'; end if; return new; end $$;
create trigger e2e_res_immutable before update of ws,user_id on public.e2e_resource for each row execute function public.e2e_immutable();
create trigger e2e_child_immutable before update of ws,user_id on public.e2e_child for each row execute function public.e2e_immutable();
create trigger e2e_child_parent before insert or update of parent_id,ws on public.e2e_child for each row execute function public.e2e_parent_guard();
alter table public.e2e_resource enable row level security;
alter table public.e2e_child enable row level security;
alter table public.e2e_private enable row level security;
create policy e2e_res_s on public.e2e_resource for select to authenticated using(public.has_workspace_access(ws));
create policy e2e_res_i on public.e2e_resource for insert to authenticated with check(public.has_workspace_role(ws,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy e2e_res_u on public.e2e_resource for update to authenticated using(public.has_workspace_role(ws,array['owner','admin','member'])) with check(public.has_workspace_role(ws,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy e2e_res_d on public.e2e_resource for delete to authenticated using(public.has_workspace_role(ws,array['owner','admin']));
create policy e2e_child_s on public.e2e_child for select to authenticated using(public.has_workspace_access(ws));
create policy e2e_child_i on public.e2e_child for insert to authenticated with check(public.has_workspace_role(ws,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy e2e_child_u on public.e2e_child for update to authenticated using(public.has_workspace_role(ws,array['owner','admin','member'])) with check(public.has_workspace_role(ws,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy e2e_child_d on public.e2e_child for delete to authenticated using(public.has_workspace_role(ws,array['owner','admin']));
create policy e2e_private_s on public.e2e_private for select to authenticated using(public.has_active_support_scope(ws,'private-read'));
revoke all on table public.e2e_resource,public.e2e_child,public.e2e_private from public,anon,sandbox_exec;
grant select,insert,update,delete on public.e2e_resource,public.e2e_child,public.e2e_private to authenticated,service_role;
select public.e2e_assert(not has_table_privilege('anon','public.e2e_resource','select'),'anon SELECT grant');
select public.e2e_assert(not has_table_privilege('authenticated','public.e2e_resource','truncate'),'authenticated TRUNCATE grant');

insert into public.e2e_ws values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
insert into public.e2e_member values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','viewer',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','member',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','admin',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','66666666-6666-6666-6666-666666666666','business_admin',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','77777777-7777-7777-7777-777777777777','manager',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','88888888-8888-8888-8888-888888888888','employee',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','99999999-9999-9999-9999-999999999999','freelancer',true,null),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa','member',true,now()-interval '1 minute'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa','member',false,null);
insert into public.e2e_platform values('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa','admin'),('aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa','super_admin');
insert into public.e2e_support values
('aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa','aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()+interval '1 hour',null),
('bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb','bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()-interval '1 minute',null),
('bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb','bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','private-read',now()+interval '1 hour',now()),
('bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb','bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','other-scope',now()+interval '1 hour',null);
insert into public.e2e_resource values
('aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','A'),
('bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B');
insert into public.e2e_child values('aaaaaaaa-aaaa-0001-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa');
insert into public.e2e_private values('aaaaaaaa-aaaa-0002-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A'),('bbbbbbbb-bbbb-0002-0000-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B');

set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.e2e_assert((select count(*) from public.e2e_resource where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=1,'viewer own SELECT');
select public.e2e_assert((select count(*) from public.e2e_resource where ws='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')=0,'cross-workspace SELECT');
select public.e2e_assert_denied($$insert into public.e2e_resource values('aaaaaaaa-aaaa-1000-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','viewer')$$);
select public.e2e_assert_denied($$update public.e2e_resource set payload='x' where id='aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa'$$);
select public.e2e_assert_denied($$delete from public.e2e_resource where id='aaaaaaaa-aaaa-0000-0000-aaaaaaaaaaaa'$$);

select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);
insert into public.e2e_resource values('aaaaaaaa-aaaa-1001-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','member');
select public.e2e_assert_denied($$insert into public.e2e_resource values('aaaaaaaa-aaaa-1002-0000-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','foreign')$$);
select public.e2e_assert_denied($$insert into public.e2e_resource values('aaaaaaaa-aaaa-1003-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','spoof')$$);
select public.e2e_assert_denied($$update public.e2e_resource set ws='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id='aaaaaaaa-aaaa-1001-0000-aaaaaaaaaaaa'$$);
select public.e2e_assert_denied($$update public.e2e_resource set user_id='11111111-1111-1111-1111-111111111111' where id='aaaaaaaa-aaaa-1001-0000-aaaaaaaaaaaa'$$);
select public.e2e_assert_denied($$update public.e2e_resource set payload='cross' where id='bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb'$$);
select public.e2e_assert_denied($$delete from public.e2e_resource where id='bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb'$$);
select public.e2e_assert_denied($$insert into public.e2e_child values('aaaaaaaa-aaaa-1004-0000-aaaaaaaaaaaa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','bbbbbbbb-bbbb-0000-0000-bbbbbbbbbbbb')$$);

select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555',false);
select public.e2e_assert((select count(*) from public.e2e_resource where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')>=2,'admin SELECT');
delete from public.e2e_resource where id='aaaaaaaa-aaaa-1001-0000-aaaaaaaaaaaa';
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666',false); select public.e2e_assert(public.has_workspace_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['admin']),'business_admin mapping');
select set_config('request.jwt.claim.sub','77777777-7777-7777-7777-777777777777',false); select public.e2e_assert(public.has_workspace_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['member']),'manager mapping');
select set_config('request.jwt.claim.sub','88888888-8888-8888-8888-888888888888',false); select public.e2e_assert(public.has_workspace_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['member']),'employee mapping');
select set_config('request.jwt.claim.sub','99999999-9999-9999-9999-999999999999',false); select public.e2e_assert(public.has_workspace_role('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',array['member']),'freelancer mapping');
select set_config('request.jwt.claim.sub','aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',false); select public.e2e_assert(not public.has_workspace_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'expired assignment');
select set_config('request.jwt.claim.sub','aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa',false); select public.e2e_assert(not public.has_workspace_access('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),'revoked assignment');
select set_config('request.jwt.claim.sub','aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',false); select public.e2e_assert((select count(*) from public.e2e_resource where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=0,'platform admin bypass');
select set_config('request.jwt.claim.sub','aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa',false); select public.e2e_assert((select count(*) from public.e2e_resource where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=0,'super_admin bypass');

select set_config('request.jwt.claim.sub','aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa',false); select public.e2e_assert((select count(*) from public.e2e_private where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=1,'active support');
select set_config('request.jwt.claim.sub','bbbbbbbb-5555-5555-5555-bbbbbbbbbbbb',false); select public.e2e_assert((select count(*) from public.e2e_private where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=0,'expired support');
select set_config('request.jwt.claim.sub','bbbbbbbb-6666-6666-6666-bbbbbbbbbbbb',false); select public.e2e_assert((select count(*) from public.e2e_private where ws='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')=0,'revoked support');
select set_config('request.jwt.claim.sub','bbbbbbbb-7777-7777-7777-bbbbbbbbbbbb',false); select public.e2e_assert((select count(*) from public.e2e_private where ws='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')=0,'wrong support scope');

reset role;
create or replace function public.e2e_service_fetch(w uuid) returns setof public.e2e_resource language sql security definer set search_path='' as $$ select r.* from public.e2e_resource r where w is not null and r.ws=w $$;
revoke all on function public.e2e_service_fetch(uuid) from public,anon,authenticated;
grant execute on function public.e2e_service_fetch(uuid) to service_role;
set role service_role;
select public.e2e_assert((select count(*) from public.e2e_service_fetch(null))=0,'service unbound tenant');
select public.e2e_assert((select count(*) from public.e2e_service_fetch('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))>=1,'service bound tenant');
reset role;
select 'PASS: full negative role / tenant E2E foundation' as result;