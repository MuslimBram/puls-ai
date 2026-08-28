#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create or replace function public.has_workspace_access(_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and w.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id and wm.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.workspace_access_assignments waa
    where waa.workspace_id = _workspace_id
      and waa.user_id = (select auth.uid())
      and waa.is_active
      and (waa.expires_at is null or waa.expires_at > pg_catalog.now())
  );
$$;
revoke all on function public.has_workspace_access(uuid) from public, anon, authenticated;
grant execute on function public.has_workspace_access(uuid) to authenticated, service_role;

create table public.message_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid null,
  inbox_message_id uuid null
);
create table public.message_delivery_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid null,
  inbox_message_id uuid null
);
create table public.conversation_locks (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  locked_by uuid not null,
  expires_at timestamptz not null default now() + interval '2 minutes'
);
create unique index conversation_locks_thread_id_key on public.conversation_locks(thread_id);
create table public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null,
  content text not null
);
create table public.telegram_messages (
  update_id bigint primary key,
  chat_id bigint not null,
  raw_update jsonb not null
);

alter table public.message_media enable row level security;
alter table public.message_delivery_states enable row level security;
alter table public.conversation_locks enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.telegram_messages enable row level security;

create policy "Users insert own media" on public.message_media for insert to authenticated with check (auth.uid()=user_id);
create policy "Users see own media" on public.message_media for select to authenticated using (auth.uid()=user_id);
create policy "Users see own delivery states" on public.message_delivery_states for select to authenticated using (auth.uid()=user_id);
create policy "Users can delete own locks" on public.conversation_locks for delete to authenticated using (auth.uid()=locked_by);
create policy "Users can create locks" on public.conversation_locks for insert to authenticated with check (auth.uid()=locked_by);
create policy "Users can view locks on their threads" on public.conversation_locks for select to authenticated using (true);
create policy "Users can view own locks" on public.conversation_locks for select to authenticated using (auth.uid()=locked_by);
create policy "Users can update own locks" on public.conversation_locks for update to authenticated using (auth.uid()=locked_by);
create policy "Users can manage own conversation_notes" on public.conversation_notes for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant all on table public.message_media, public.message_delivery_states,
  public.conversation_locks, public.conversation_notes, public.telegram_messages
  to public, anon, authenticated, service_role;

insert into public.workspaces(id, owner_id)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','99999999-9999-9999-9999-999999999999');
insert into public.conversation_threads(
  id,user_id,workspace_id,channel_type,contact_identifier,message_count,unread_count
) values
  ('aaaaaaaa-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','email','a@example.test',0,0),
  ('bbbbbbbb-0000-0000-0000-000000000010','99999999-9999-9999-9999-999999999999','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','email','b@example.test',0,0);
insert into public.message_delivery_states(id,user_id,workspace_id)
values
  ('aaaaaaaa-0000-0000-0000-000000000020','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-0000-0000-0000-000000000020','99999999-9999-9999-9999-999999999999','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SQL

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260828131500_p0_3_inbox_ancillary_isolation.sql

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not (select attnotnull from pg_attribute where attrelid='public.message_media'::regclass and attname='workspace_id') then
    raise exception 'message_media.workspace_id remains nullable';
  end if;
  if not (select attnotnull from pg_attribute where attrelid='public.message_delivery_states'::regclass and attname='workspace_id') then
    raise exception 'message_delivery_states.workspace_id remains nullable';
  end if;
  if has_table_privilege('anon','public.message_media','select')
     or has_table_privilege('anon','public.message_delivery_states','select')
     or has_table_privilege('anon','public.conversation_locks','select')
     or has_table_privilege('anon','public.conversation_notes','select')
     or has_table_privilege('anon','public.telegram_messages','select') then
    raise exception 'anon retains Inbox ancillary table access';
  end if;
  if not has_table_privilege('authenticated','public.message_media','select')
     or not has_table_privilege('authenticated','public.message_media','insert')
     or has_table_privilege('authenticated','public.message_media','update')
     or has_table_privilege('authenticated','public.message_media','delete') then
    raise exception 'message_media authenticated privilege matrix is wrong';
  end if;
  if not has_table_privilege('authenticated','public.message_delivery_states','select')
     or has_table_privilege('authenticated','public.message_delivery_states','insert')
     or has_table_privilege('authenticated','public.message_delivery_states','update')
     or has_table_privilege('authenticated','public.message_delivery_states','delete') then
    raise exception 'message_delivery_states authenticated privilege matrix is wrong';
  end if;
  if has_table_privilege('authenticated','public.telegram_messages','select')
     or has_table_privilege('authenticated','public.telegram_messages','insert')
     or has_table_privilege('authenticated','public.telegram_messages','update')
     or has_table_privilege('authenticated','public.telegram_messages','delete') then
    raise exception 'telegram_messages is not service-role-only';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in ('message_media','message_delivery_states','conversation_locks','conversation_notes')
      and policyname in (
        'Users insert own media','Users see own media','Users see own delivery states',
        'Users can delete own locks','Users can create locks','Users can view locks on their threads',
        'Users can view own locks','Users can update own locks','Users can manage own conversation_notes'
      )
  ) then raise exception 'Legacy ancillary Inbox policies remain'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('conversation_locks','conversation_notes')
      and cmd='UPDATE' and (qual is null or with_check is null)
  ) then raise exception 'Ancillary UPDATE policy misses USING or WITH CHECK'; end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

do $$
declare
  visible_delivery integer;
begin
  select count(*) into visible_delivery from public.message_delivery_states;
  if visible_delivery <> 1 then raise exception 'Cross-workspace delivery state is visible'; end if;

  insert into public.message_media(user_id,workspace_id,inbox_message_id)
  values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',null);
  insert into public.conversation_notes(thread_id,user_id,content)
  values ('aaaaaaaa-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','Allowed note');
  insert into public.conversation_locks(thread_id,locked_by)
  values ('aaaaaaaa-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111');

  begin
    insert into public.message_media(user_id,workspace_id,inbox_message_id)
    values ('11111111-1111-1111-1111-111111111111','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',null);
    raise exception 'Cross-workspace media insert was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.conversation_notes(thread_id,user_id,content)
    values ('bbbbbbbb-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111','Denied note');
    raise exception 'Cross-workspace note insert was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.conversation_locks(thread_id,locked_by)
    values ('bbbbbbbb-0000-0000-0000-000000000010','11111111-1111-1111-1111-111111111111');
    raise exception 'Cross-workspace lock insert was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;
SQL
