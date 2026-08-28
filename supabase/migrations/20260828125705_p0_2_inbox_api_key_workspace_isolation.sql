begin;

lock table public.inbox_messages, public.api_keys in share row exclusive mode;

-- Resolve only legacy rows whose user maps to exactly one active workspace.
with candidates as (
  select w.owner_id as user_id, w.id as workspace_id
  from public.workspaces w
  union
  select wm.user_id, wm.workspace_id
  from public.workspace_members wm
  union
  select waa.user_id, waa.workspace_id
  from public.workspace_access_assignments waa
  where waa.is_active
    and (waa.expires_at is null or waa.expires_at > pg_catalog.now())
),
unique_workspace as (
  select user_id, (array_agg(workspace_id order by workspace_id))[1] as workspace_id
  from candidates
  group by user_id
  having count(distinct workspace_id) = 1
)
update public.inbox_messages im
set workspace_id = uw.workspace_id
from unique_workspace uw
where im.workspace_id is null
  and im.user_id = uw.user_id;

with candidates as (
  select w.owner_id as user_id, w.id as workspace_id
  from public.workspaces w
  union
  select wm.user_id, wm.workspace_id
  from public.workspace_members wm
  union
  select waa.user_id, waa.workspace_id
  from public.workspace_access_assignments waa
  where waa.is_active
    and (waa.expires_at is null or waa.expires_at > pg_catalog.now())
),
unique_workspace as (
  select user_id, (array_agg(workspace_id order by workspace_id))[1] as workspace_id
  from candidates
  group by user_id
  having count(distinct workspace_id) = 1
)
update public.api_keys ak
set workspace_id = uw.workspace_id
from unique_workspace uw
where ak.workspace_id is null
  and ak.user_id = uw.user_id;

do $$
begin
  if exists (select 1 from public.inbox_messages where workspace_id is null) then
    raise exception 'Cannot enforce inbox_messages.workspace_id: unresolved legacy rows remain';
  end if;
  if exists (select 1 from public.api_keys where workspace_id is null) then
    raise exception 'Cannot enforce api_keys.workspace_id: unresolved legacy rows remain';
  end if;
end
$$;

alter table public.inbox_messages alter column workspace_id set not null;
alter table public.api_keys alter column workspace_id set not null;

-- Replace user-owned Inbox policies with canonical workspace authorization.
drop policy if exists "Users can delete own inbox messages" on public.inbox_messages;
drop policy if exists "Users can insert own inbox messages" on public.inbox_messages;
drop policy if exists "Users can view own inbox messages" on public.inbox_messages;
drop policy if exists "Users can update own inbox messages" on public.inbox_messages;
drop policy if exists "Support sessions can view inbox messages" on public.inbox_messages;

create policy "p0 workspace members can view inbox messages"
on public.inbox_messages for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p0 support sessions can view inbox messages"
on public.inbox_messages for select to authenticated
using (public.has_active_support_scope(workspace_id, 'messages'));

create policy "p0 workspace members can create inbox messages"
on public.inbox_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 workspace members can update inbox messages"
on public.inbox_messages for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 owners and admins can delete inbox messages"
on public.inbox_messages for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- API keys are managed only through the authenticated Edge Function. These
-- policies remain defense in depth if direct Data API grants are added later.
drop policy if exists "Users delete own API keys" on public.api_keys;
drop policy if exists "Users insert own API keys with default permissions" on public.api_keys;
drop policy if exists "Users view own API keys" on public.api_keys;
drop policy if exists "Users update own API keys metadata" on public.api_keys;

create policy "p0 owners and admins can view api keys"
on public.api_keys for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can create api keys"
on public.api_keys for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin'])
);

create policy "p0 owners and admins can update api keys"
on public.api_keys for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 owners and admins can delete api keys"
on public.api_keys for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- Remove broad table privileges. API keys stay Edge-Function-only.
revoke all on table public.inbox_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.inbox_messages to authenticated;
revoke truncate, trigger, references on table public.inbox_messages from authenticated;

revoke all on table public.api_keys from public, anon, authenticated;

-- Retire the arbitrary-user, workspace-less thread writer.
drop function if exists public.upsert_conversation_thread(uuid, text, text, text, text, text);

-- Caller-bound Voice/UI writer. It runs as the signed-in user, so canonical
-- conversation_threads RLS still applies.
create or replace function public.upsert_my_conversation_thread(
  _workspace_id uuid,
  _channel_type text,
  _contact_identifier text,
  _contact_name text,
  _message_preview text,
  _direction text default 'inbound'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_thread_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if _workspace_id is null
     or nullif(pg_catalog.btrim(_channel_type), '') is null
     or nullif(pg_catalog.btrim(_contact_identifier), '') is null then
    raise exception 'workspace_id, channel_type and contact_identifier are required';
  end if;
  if _direction not in ('inbound', 'outbound') then
    raise exception 'direction must be inbound or outbound';
  end if;
  if not public.has_workspace_role(_workspace_id, array['owner','admin','member']) then
    raise exception 'Workspace access denied';
  end if;

  insert into public.conversation_threads as ct (
    user_id,
    workspace_id,
    channel_type,
    contact_identifier,
    contact_name,
    last_message_at,
    last_message_preview,
    message_count,
    unread_count
  )
  values (
    v_user_id,
    _workspace_id,
    _channel_type,
    _contact_identifier,
    _contact_name,
    pg_catalog.now(),
    pg_catalog.left(coalesce(_message_preview, ''), 200),
    1,
    case when _direction = 'inbound' then 1 else 0 end
  )
  on conflict (user_id, workspace_id, channel_type, contact_identifier)
  do update set
    last_message_at = pg_catalog.now(),
    last_message_preview = pg_catalog.left(coalesce(_message_preview, ''), 200),
    message_count = coalesce(ct.message_count, 0) + 1,
    unread_count = case
      when _direction = 'inbound' then coalesce(ct.unread_count, 0) + 1
      else coalesce(ct.unread_count, 0)
    end,
    contact_name = coalesce(excluded.contact_name, ct.contact_name),
    updated_at = pg_catalog.now()
  returning id into v_thread_id;

  return v_thread_id;
end
$$;

revoke all on function public.upsert_my_conversation_thread(uuid, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.upsert_my_conversation_thread(uuid, text, text, text, text, text)
to authenticated;

commit;
