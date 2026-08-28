begin;

-- These tables already carry workspace identity. Abort rather than inventing
-- ownership if future legacy rows appear before this migration is applied.
do $$
begin
  if exists (select 1 from public.message_media where workspace_id is null) then
    raise exception 'Cannot enforce message_media.workspace_id: unresolved legacy rows remain';
  end if;
  if exists (select 1 from public.message_delivery_states where workspace_id is null) then
    raise exception 'Cannot enforce message_delivery_states.workspace_id: unresolved legacy rows remain';
  end if;
end
$$;

alter table public.message_media alter column workspace_id set not null;
alter table public.message_delivery_states alter column workspace_id set not null;

alter table public.message_media enable row level security;
alter table public.message_delivery_states enable row level security;
alter table public.conversation_locks enable row level security;
alter table public.conversation_notes enable row level security;
alter table public.telegram_messages enable row level security;

-- Media: workspace members can read/upload; temporary support access requires
-- the explicit files scope. Provider ingestion continues through service_role.
drop policy if exists "Users insert own media" on public.message_media;
drop policy if exists "Users see own media" on public.message_media;

create policy "p0 workspace members and scoped support can view message media"
on public.message_media for select to authenticated
using (
  public.has_workspace_access(workspace_id)
  or public.has_active_support_scope(workspace_id, 'files')
);

create policy "p0 workspace members can create message media"
on public.message_media for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

-- Delivery state is provider-owned operational data. Browser users only read
-- their workspace; temporary support requires the metadata scope.
drop policy if exists "Users see own delivery states" on public.message_delivery_states;

create policy "p0 workspace members and scoped support can view delivery states"
on public.message_delivery_states for select to authenticated
using (
  public.has_workspace_access(workspace_id)
  or public.has_active_support_scope(workspace_id, 'metadata')
);

-- Locks inherit tenant identity from their canonical conversation thread.
drop policy if exists "Users can delete own locks" on public.conversation_locks;
drop policy if exists "Users can create locks" on public.conversation_locks;
drop policy if exists "Users can view locks on their threads" on public.conversation_locks;
drop policy if exists "Users can view own locks" on public.conversation_locks;
drop policy if exists "Users can update own locks" on public.conversation_locks;

create policy "p0 workspace members can view active conversation locks"
on public.conversation_locks for select to authenticated
using (
  expires_at > pg_catalog.now()
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_locks.thread_id
      and public.has_workspace_access(ct.workspace_id)
  )
);

create policy "p0 workspace members can create own conversation locks"
on public.conversation_locks for insert to authenticated
with check (
  locked_by = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_locks.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 workspace members can update own conversation locks"
on public.conversation_locks for update to authenticated
using (
  locked_by = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_locks.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
)
with check (
  locked_by = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_locks.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 members can release own or expired conversation locks"
on public.conversation_locks for delete to authenticated
using (
  (locked_by = (select auth.uid()) or expires_at <= pg_catalog.now())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_locks.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

-- Notes also inherit tenant identity from their thread. Authors retain edit and
-- delete ownership while every workspace member can collaborate by reading and
-- adding notes.
drop policy if exists "Users can manage own conversation_notes" on public.conversation_notes;

create policy "p0 workspace members can view conversation notes"
on public.conversation_notes for select to authenticated
using (
  exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_notes.thread_id
      and public.has_workspace_access(ct.workspace_id)
  )
);

create policy "p0 workspace members can create own conversation notes"
on public.conversation_notes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_notes.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 workspace members can update own conversation notes"
on public.conversation_notes for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_notes.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_notes.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 workspace members can delete own conversation notes"
on public.conversation_notes for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_threads ct
    where ct.id = conversation_notes.thread_id
      and public.has_workspace_role(ct.workspace_id, array['owner','admin','member'])
  )
);

-- Exact object privileges: authenticated clients receive only the operations
-- backed by the policies above. telegram_messages is a legacy raw provider sink
-- with no workspace identity and remains service-role-only.
revoke all on table public.message_media from public, anon, authenticated;
grant select, insert on table public.message_media to authenticated;

revoke all on table public.message_delivery_states from public, anon, authenticated;
grant select on table public.message_delivery_states to authenticated;

revoke all on table public.conversation_locks from public, anon, authenticated;
grant select, insert, update, delete on table public.conversation_locks to authenticated;

revoke all on table public.conversation_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.conversation_notes to authenticated;

revoke all on table public.telegram_messages from public, anon, authenticated;

comment on table public.telegram_messages is
  'Legacy raw Telegram update sink. Service-role-only until workspace identity is added.';

commit;
