#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
alter table public.conversation_threads
  alter column id set default gen_random_uuid(),
  add column user_id uuid not null,
  add column channel_type text not null,
  add column contact_identifier text not null,
  add column contact_name text,
  add column last_message_at timestamptz,
  add column last_message_preview text,
  add column message_count integer not null default 0,
  add column unread_count integer not null default 0,
  add column updated_at timestamptz not null default now();

alter table public.conversation_threads
  add constraint conversation_threads_workspace_contact_key
  unique (user_id, workspace_id, channel_type, contact_identifier);
alter table public.conversation_threads enable row level security;
grant select, insert, update, delete on table public.conversation_threads to authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

create table public.inbox_messages (
  id uuid primary key,
  user_id uuid not null,
  workspace_id uuid null
);
alter table public.inbox_messages enable row level security;

create table public.api_keys (
  id uuid primary key,
  user_id uuid not null,
  workspace_id uuid null,
  permissions text[] not null default array['read']::text[],
  rate_limit_per_minute integer not null default 60
);
alter table public.api_keys enable row level security;

create or replace function public.has_active_support_scope(_workspace uuid, _scope text)
returns boolean language sql stable security definer set search_path='' as $$ select false $$;

create or replace function public.upsert_conversation_thread(
  _user_id uuid,
  _channel_type text,
  _contact_identifier text,
  _contact_name text,
  _message_preview text,
  _direction text default 'inbound'
) returns uuid language sql security definer set search_path=''
as $$ select null::uuid $$;

create policy "Users can delete own inbox messages" on public.inbox_messages for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users can insert own inbox messages" on public.inbox_messages for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users can view own inbox messages" on public.inbox_messages for select to authenticated using ((select auth.uid())=user_id);
create policy "Users can update own inbox messages" on public.inbox_messages for update to authenticated using ((select auth.uid())=user_id);
create policy "Support sessions can view inbox messages" on public.inbox_messages for select to authenticated using (public.has_active_support_scope(workspace_id,'messages'));

create policy "Users delete own API keys" on public.api_keys for delete to authenticated using ((select auth.uid())=user_id);
create policy "Users insert own API keys with default permissions" on public.api_keys for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Users view own API keys" on public.api_keys for select to authenticated using ((select auth.uid())=user_id);
create policy "Users update own API keys metadata" on public.api_keys for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

grant all on table public.inbox_messages, public.api_keys to public, anon, authenticated;
grant execute on function public.upsert_conversation_thread(uuid,text,text,text,text,text) to authenticated;

insert into public.inbox_messages(id,user_id,workspace_id)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',null);
insert into public.api_keys(id,user_id,workspace_id)
values ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',null);
SQL

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1   -f supabase/migrations/20260828125705_p0_2_inbox_api_key_workspace_isolation.sql

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if exists (select 1 from public.inbox_messages where workspace_id is null) then
    raise exception 'Inbox backfill failed';
  end if;
  if exists (select 1 from public.api_keys where workspace_id is null) then
    raise exception 'API-key backfill failed';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid='public.inbox_messages'::regclass and attname='workspace_id' and attnotnull
  ) then raise exception 'inbox_messages.workspace_id is still nullable'; end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid='public.api_keys'::regclass and attname='workspace_id' and attnotnull
  ) then raise exception 'api_keys.workspace_id is still nullable'; end if;

  if to_regprocedure('public.upsert_conversation_thread(uuid,text,text,text,text,text)') is not null then
    raise exception 'Legacy workspace-less thread function remains';
  end if;
  if to_regprocedure('public.upsert_my_conversation_thread(uuid,text,text,text,text,text)') is null then
    raise exception 'Caller-bound thread function missing';
  end if;
  if (select prosecdef from pg_proc where oid='public.upsert_my_conversation_thread(uuid,text,text,text,text,text)'::regprocedure) then
    raise exception 'Caller-bound thread function bypasses RLS';
  end if;
  if has_function_privilege('anon','public.upsert_my_conversation_thread(uuid,text,text,text,text,text)','execute') then
    raise exception 'anon can execute caller-bound thread function';
  end if;
  if not has_function_privilege('authenticated','public.upsert_my_conversation_thread(uuid,text,text,text,text,text)','execute') then
    raise exception 'authenticated cannot execute caller-bound thread function';
  end if;

  if has_table_privilege('anon','public.inbox_messages','select')
     or has_table_privilege('anon','public.api_keys','select') then
    raise exception 'anon retains tenant-data table access';
  end if;
  if has_table_privilege('authenticated','public.api_keys','select')
     or has_table_privilege('authenticated','public.api_keys','insert')
     or has_table_privilege('authenticated','public.api_keys','update')
     or has_table_privilege('authenticated','public.api_keys','delete') then
    raise exception 'authenticated retains direct API-key table access';
  end if;
  if not has_table_privilege('authenticated','public.inbox_messages','select')
     or not has_table_privilege('authenticated','public.inbox_messages','insert')
     or not has_table_privilege('authenticated','public.inbox_messages','update')
     or not has_table_privilege('authenticated','public.inbox_messages','delete') then
    raise exception 'authenticated Inbox DML grants are incomplete';
  end if;
  if has_table_privilege('authenticated','public.inbox_messages','truncate')
     or has_table_privilege('authenticated','public.inbox_messages','trigger')
     or has_table_privilege('authenticated','public.inbox_messages','references') then
    raise exception 'authenticated retains dangerous Inbox privileges';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename in ('inbox_messages','api_keys')
      and (coalesce(qual,'') ilike '%auth.uid() = user_id%'
        or coalesce(with_check,'') ilike '%auth.uid() = user_id%')
  ) then raise exception 'Legacy user-owned policies remain'; end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='inbox_messages' and cmd='UPDATE'
      and (qual is null or with_check is null)
  ) then raise exception 'Inbox UPDATE is missing USING or WITH CHECK'; end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.upsert_my_conversation_thread(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'voice',
  '+15550000000',
  'P0.2 test',
  'Incoming call',
  'inbound'
);
reset role;

do $$
begin
  if not exists (
    select 1 from public.conversation_threads
    where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      and user_id='11111111-1111-1111-1111-111111111111'
      and channel_type='voice'
  ) then raise exception 'Caller-bound thread runtime test failed'; end if;
end
$$;
SQL
