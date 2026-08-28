#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create or replace function public.is_workspace_member(_user_id uuid, _workspace_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.user_id=_user_id and wm.workspace_id=_workspace_id
  )
$$;

create or replace function public.is_workspace_owner(_user_id uuid, _workspace_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.owner_id=_user_id and w.id=_workspace_id
  )
$$;

create table public.call_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null,
  user_id uuid not null,
  call_status text not null default 'completed'
);
create table public.active_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agent_user_id uuid null,
  call_record_id uuid null,
  status text not null default 'ringing'
);
create table public.call_queues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null
);
create table public.call_queue_members (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null,
  user_id uuid not null
);
create table public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  call_record_id uuid null,
  active_call_id uuid null,
  agent_user_id uuid null
);
create table public.call_scripts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  name text not null
);
create table public.call_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  call_record_id uuid not null,
  note_text text not null
);
create table public.call_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  call_record_id uuid not null,
  tag text not null
);

alter table public.active_calls enable row level security;
alter table public.call_queues enable row level security;
alter table public.call_queue_members enable row level security;
alter table public.call_recordings enable row level security;
alter table public.call_records enable row level security;
alter table public.call_scripts enable row level security;
alter table public.call_notes enable row level security;
alter table public.call_tags enable row level security;

create policy "Users can manage their own active calls" on public.active_calls for all to authenticated using ((agent_user_id=auth.uid()) or public.is_workspace_owner(auth.uid(),workspace_id));
create policy "Users can view active calls in their workspace" on public.active_calls for select to authenticated using (public.is_workspace_member(auth.uid(),workspace_id));
create policy "Workspace owners can manage call queues" on public.call_queues for all to authenticated using (public.is_workspace_owner(auth.uid(),workspace_id));
create policy "Users can view call queues in their workspace" on public.call_queues for select to authenticated using (public.is_workspace_member(auth.uid(),workspace_id));
create policy "Owners can manage queue membership" on public.call_queue_members for all to authenticated using (exists(select 1 from public.call_queues cq where cq.id=call_queue_members.queue_id and public.is_workspace_owner(auth.uid(),cq.workspace_id)));
create policy "Members can view queue membership" on public.call_queue_members for select to authenticated using (exists(select 1 from public.call_queues cq where cq.id=call_queue_members.queue_id and public.is_workspace_member(auth.uid(),cq.workspace_id)));
create policy "Users can manage their own recordings" on public.call_recordings for all to authenticated using ((agent_user_id=auth.uid()) or public.is_workspace_owner(auth.uid(),workspace_id));
create policy "Users can view recordings in workspace" on public.call_recordings for select to authenticated using (public.is_workspace_member(auth.uid(),workspace_id));
create policy "Users can manage own call_records" on public.call_records for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own scripts" on public.call_scripts for all to authenticated using (auth.uid()=user_id);
create policy "Workspace members can view scripts" on public.call_scripts for select to authenticated using (public.is_workspace_member(auth.uid(),workspace_id));
create policy "Users manage own call notes" on public.call_notes for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users manage own call tags" on public.call_tags for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant all on table public.active_calls, public.call_queues, public.call_queue_members,
  public.call_recordings, public.call_records, public.call_scripts,
  public.call_notes, public.call_tags to public, anon, authenticated, service_role;

insert into public.workspace_members(workspace_id,user_id,role)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','member');

insert into public.call_records(id,workspace_id,user_id) values
  ('aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999');
insert into public.active_calls(id,workspace_id,agent_user_id,call_record_id) values
  ('aaaaaaaa-1000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1000-0000-0000-000000000001'),
  ('bbbbbbbb-1000-0000-0000-000000000002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999','bbbbbbbb-1000-0000-0000-000000000001');
insert into public.call_queues(id,workspace_id,name) values
  ('aaaaaaaa-1000-0000-0000-000000000003','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A queue'),
  ('bbbbbbbb-1000-0000-0000-000000000003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B queue');
insert into public.call_queue_members(id,queue_id,user_id) values
  ('aaaaaaaa-1000-0000-0000-000000000004','aaaaaaaa-1000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-1000-0000-0000-000000000004','bbbbbbbb-1000-0000-0000-000000000003','99999999-9999-9999-9999-999999999999');
insert into public.call_recordings(id,workspace_id,call_record_id,active_call_id,agent_user_id) values
  ('aaaaaaaa-1000-0000-0000-000000000005','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-1000-0000-0000-000000000005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-1000-0000-0000-000000000002','99999999-9999-9999-9999-999999999999');
insert into public.call_scripts(id,workspace_id,user_id,name) values
  ('aaaaaaaa-1000-0000-0000-000000000006','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','A script'),
  ('bbbbbbbb-1000-0000-0000-000000000006','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999','B script');
insert into public.call_notes(id,workspace_id,user_id,call_record_id,note_text) values
  ('aaaaaaaa-1000-0000-0000-000000000007','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1000-0000-0000-000000000001','A note'),
  ('bbbbbbbb-1000-0000-0000-000000000007','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999','bbbbbbbb-1000-0000-0000-000000000001','B note');
insert into public.call_tags(id,workspace_id,user_id,call_record_id,tag) values
  ('aaaaaaaa-1000-0000-0000-000000000008','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-1000-0000-0000-000000000001','a'),
  ('bbbbbbbb-1000-0000-0000-000000000008','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999','bbbbbbbb-1000-0000-0000-000000000001','b');
SQL

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260828200000_p0_4_call_voice_workspace_isolation.sql

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  t text;
begin
  if not (select attnotnull from pg_attribute where attrelid='public.call_records'::regclass and attname='workspace_id') then
    raise exception 'call_records.workspace_id remains nullable';
  end if;

  foreach t in array array['active_calls','call_queues','call_queue_members','call_recordings','call_records','call_scripts','call_notes','call_tags']
  loop
    if has_table_privilege('anon',format('public.%I',t),'select')
       or has_table_privilege('anon',format('public.%I',t),'insert')
       or has_table_privilege('anon',format('public.%I',t),'update')
       or has_table_privilege('anon',format('public.%I',t),'delete') then
      raise exception 'anon retains CALL privilege on %', t;
    end if;
    if has_table_privilege('authenticated',format('public.%I',t),'truncate')
       or has_table_privilege('authenticated',format('public.%I',t),'trigger')
       or has_table_privilege('authenticated',format('public.%I',t),'references') then
      raise exception 'authenticated retains dangerous CALL privilege on %', t;
    end if;
  end loop;

  if not has_table_privilege('authenticated','public.active_calls','select')
     or not has_table_privilege('authenticated','public.active_calls','insert')
     or not has_table_privilege('authenticated','public.active_calls','update')
     or has_table_privilege('authenticated','public.active_calls','delete') then
    raise exception 'active_calls privilege matrix is wrong';
  end if;
  if not has_table_privilege('authenticated','public.call_records','select')
     or not has_table_privilege('authenticated','public.call_records','insert')
     or not has_table_privilege('authenticated','public.call_records','update')
     or has_table_privilege('authenticated','public.call_records','delete') then
    raise exception 'call_records privilege matrix is wrong';
  end if;
  if not has_table_privilege('authenticated','public.call_recordings','select')
     or not has_table_privilege('authenticated','public.call_recordings','insert')
     or has_table_privilege('authenticated','public.call_recordings','update')
     or has_table_privilege('authenticated','public.call_recordings','delete') then
    raise exception 'call_recordings privilege matrix is wrong';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('active_calls','call_queues','call_queue_members','call_recordings','call_records','call_scripts','call_notes','call_tags')
      and policyname in (
        'Users can manage their own active calls','Users can view active calls in their workspace',
        'Workspace owners can manage call queues','Users can view call queues in their workspace',
        'Owners can manage queue membership','Members can view queue membership',
        'Users can manage their own recordings','Users can view recordings in workspace',
        'Users can manage own call_records','Users can manage own scripts',
        'Workspace members can view scripts','Users manage own call notes','Users manage own call tags'
      )
  ) then raise exception 'Legacy CALL policies remain'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('active_calls','call_queues','call_queue_members','call_records','call_scripts')
      and cmd='UPDATE' and (qual is null or with_check is null)
  ) then raise exception 'CALL UPDATE policy misses USING or WITH CHECK'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('active_calls','call_queues','call_queue_members','call_recordings','call_records','call_scripts','call_notes','call_tags')
      and (coalesce(qual,'') ilike '%is_workspace_member(%' or coalesce(qual,'') ilike '%is_workspace_owner(%'
        or coalesce(with_check,'') ilike '%is_workspace_member(%' or coalesce(with_check,'') ilike '%is_workspace_owner(%')
  ) then raise exception 'Legacy arbitrary-user workspace helper remains in CALL policies'; end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

do $$
declare
  new_record uuid;
begin
  if exists(select 1 from public.call_records where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace call record is visible';
  end if;
  if exists(select 1 from public.active_calls where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace active call is visible';
  end if;
  if exists(select 1 from public.call_queues where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace queue is visible';
  end if;
  if exists(select 1 from public.call_recordings where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace recording is visible';
  end if;
  if exists(select 1 from public.call_scripts where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace script is visible';
  end if;
  if exists(select 1 from public.call_notes where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace note is visible';
  end if;
  if exists(select 1 from public.call_tags where workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
    raise exception 'Cross-workspace tag is visible';
  end if;
  if exists(select 1 from public.call_queue_members where queue_id='bbbbbbbb-1000-0000-0000-000000000003') then
    raise exception 'Cross-workspace queue assignment is visible';
  end if;

  insert into public.call_records(workspace_id,user_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111')
  returning id into new_record;
  insert into public.active_calls(workspace_id,agent_user_id,call_record_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',new_record);
  insert into public.call_queues(workspace_id,name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Owner-created queue');
  insert into public.call_recordings(workspace_id,call_record_id,agent_user_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',new_record,'11111111-1111-1111-1111-111111111111');
  insert into public.call_scripts(workspace_id,user_id,name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Owner script');
  insert into public.call_notes(workspace_id,user_id,call_record_id,note_text)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',new_record,'Owner note');
  insert into public.call_tags(workspace_id,user_id,call_record_id,tag)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111',new_record,'owner');

  begin
    insert into public.call_records(workspace_id,user_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111');
    raise exception 'Cross-workspace call record insert was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.call_notes(workspace_id,user_id,call_record_id,note_text)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','bbbbbbbb-1000-0000-0000-000000000001','Mismatched note');
    raise exception 'Cross-workspace linked note insert was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);

do $$
declare
  member_record uuid;
begin
  insert into public.call_records(workspace_id,user_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222')
  returning id into member_record;
  insert into public.active_calls(workspace_id,agent_user_id,call_record_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',member_record);
  insert into public.call_scripts(workspace_id,user_id,name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222','Member script');
  insert into public.call_notes(workspace_id,user_id,call_record_id,note_text)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','22222222-2222-2222-2222-222222222222',member_record,'Member note');

  begin
    insert into public.call_queues(workspace_id,name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Member must not administer queues');
    raise exception 'Member queue administration was allowed';
  exception when insufficient_privilege then null;
  end;

  update public.active_calls set status='tampered'
  where id='aaaaaaaa-1000-0000-0000-000000000002';
end
$$;

reset role;

do $$
begin
  if (select status from public.active_calls where id='aaaaaaaa-1000-0000-0000-000000000002')='tampered' then
    raise exception 'Member updated another agent active call';
  end if;
end
$$;
SQL
