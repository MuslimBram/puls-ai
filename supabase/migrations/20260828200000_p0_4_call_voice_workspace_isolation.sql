begin;

-- P0.4 closes the CALL/Voice tenant boundary without inventing ownership.
-- Every existing call record must already carry an unambiguous workspace.
do $$
begin
  if exists (select 1 from public.call_records where workspace_id is null) then
    raise exception 'Cannot enforce call_records.workspace_id: unresolved legacy rows remain';
  end if;
end
$$;

alter table public.call_records alter column workspace_id set not null;

alter table public.active_calls enable row level security;
alter table public.call_queues enable row level security;
alter table public.call_queue_members enable row level security;
alter table public.call_recordings enable row level security;
alter table public.call_records enable row level security;
alter table public.call_scripts enable row level security;
alter table public.call_notes enable row level security;
alter table public.call_tags enable row level security;

-- Retire user-owned and arbitrary-user helper policies.
drop policy if exists "Users can manage their own active calls" on public.active_calls;
drop policy if exists "Users can view active calls in their workspace" on public.active_calls;
drop policy if exists "Workspace owners can manage call queues" on public.call_queues;
drop policy if exists "Users can view call queues in their workspace" on public.call_queues;
drop policy if exists "Owners can manage queue membership" on public.call_queue_members;
drop policy if exists "Members can view queue membership" on public.call_queue_members;
drop policy if exists "Users can manage their own recordings" on public.call_recordings;
drop policy if exists "Users can view recordings in workspace" on public.call_recordings;
drop policy if exists "Users can manage own call_records" on public.call_records;
drop policy if exists "Users can manage own scripts" on public.call_scripts;
drop policy if exists "Workspace members can view scripts" on public.call_scripts;
drop policy if exists "Users manage own call notes" on public.call_notes;
drop policy if exists "Users manage own call tags" on public.call_tags;

-- Active calls: all workspace roles can see calls. Agents can claim an
-- unassigned call and then mutate only their own call; owner/admin may manage.
create policy "p0 call members view active calls"
on public.active_calls for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 call agents create own active calls"
on public.active_calls for insert to authenticated
with check (
  agent_user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 call agents update assigned active calls"
on public.active_calls for update to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    public.has_workspace_role(workspace_id, array['member'])
    and (agent_user_id is null or agent_user_id = (select auth.uid()))
  )
)
with check (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    public.has_workspace_role(workspace_id, array['member'])
    and agent_user_id = (select auth.uid())
  )
);

-- Queue configuration is business administration; membership can read it.
create policy "p0 call members view queues"
on public.call_queues for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 call admins create queues"
on public.call_queues for insert to authenticated
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 call admins update queues"
on public.call_queues for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']))
with check (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "p0 call admins delete queues"
on public.call_queues for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));

-- Queue membership inherits the workspace from its queue.
create policy "p0 call members view queue assignments"
on public.call_queue_members for select to authenticated
using (
  exists (
    select 1 from public.call_queues cq
    where cq.id = call_queue_members.queue_id
      and public.has_workspace_role(cq.workspace_id, array['owner','admin','member'])
  )
);

create policy "p0 call admins create queue assignments"
on public.call_queue_members for insert to authenticated
with check (
  exists (
    select 1 from public.call_queues cq
    where cq.id = call_queue_members.queue_id
      and public.has_workspace_role(cq.workspace_id, array['owner','admin'])
  )
);

create policy "p0 call admins update queue assignments"
on public.call_queue_members for update to authenticated
using (
  exists (
    select 1 from public.call_queues cq
    where cq.id = call_queue_members.queue_id
      and public.has_workspace_role(cq.workspace_id, array['owner','admin'])
  )
)
with check (
  exists (
    select 1 from public.call_queues cq
    where cq.id = call_queue_members.queue_id
      and public.has_workspace_role(cq.workspace_id, array['owner','admin'])
  )
);

create policy "p0 call admins delete queue assignments"
on public.call_queue_members for delete to authenticated
using (
  exists (
    select 1 from public.call_queues cq
    where cq.id = call_queue_members.queue_id
      and public.has_workspace_role(cq.workspace_id, array['owner','admin'])
  )
);

-- Recording metadata is readable by workspace members. Browser-created
-- recordings must belong to the current agent; provider/AI writes use service_role.
create policy "p0 call members view recordings"
on public.call_recordings for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 call agents create own recordings"
on public.call_recordings for insert to authenticated
with check (
  agent_user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

-- Call history is shared workspace data. Members can create their own record and
-- update workspace records; destructive deletion remains server-side.
create policy "p0 call members view records"
on public.call_records for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 call members create own records"
on public.call_records for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 call members update records"
on public.call_records for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id, array['owner','admin','member']));

-- Scripts are collaborative to read. Authors manage their own scripts and
-- workspace owner/admin may curate the shared library.
create policy "p0 call members view scripts"
on public.call_scripts for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin','member']));

create policy "p0 call members create own scripts"
on public.call_scripts for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
);

create policy "p0 call authors or admins update scripts"
on public.call_scripts for update to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    user_id = (select auth.uid())
    and public.has_workspace_role(workspace_id, array['member'])
  )
)
with check (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    user_id = (select auth.uid())
    and public.has_workspace_role(workspace_id, array['member'])
  )
);

create policy "p0 call authors or admins delete scripts"
on public.call_scripts for delete to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin'])
  or (
    user_id = (select auth.uid())
    and public.has_workspace_role(workspace_id, array['member'])
  )
);

-- Notes and tags must match the canonical call record workspace. Members add
-- their own annotations; authors or workspace administrators may remove them.
create policy "p0 call members view notes"
on public.call_notes for select to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_notes.call_record_id
      and cr.workspace_id = call_notes.workspace_id
  )
);

create policy "p0 call members create own notes"
on public.call_notes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_notes.call_record_id
      and cr.workspace_id = call_notes.workspace_id
  )
);

create policy "p0 call authors or admins delete notes"
on public.call_notes for delete to authenticated
using (
  (
    user_id = (select auth.uid())
    or public.has_workspace_role(workspace_id, array['owner','admin'])
  )
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_notes.call_record_id
      and cr.workspace_id = call_notes.workspace_id
  )
);

create policy "p0 call members view tags"
on public.call_tags for select to authenticated
using (
  public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_tags.call_record_id
      and cr.workspace_id = call_tags.workspace_id
  )
);

create policy "p0 call members create own tags"
on public.call_tags for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_tags.call_record_id
      and cr.workspace_id = call_tags.workspace_id
  )
);

create policy "p0 call authors or admins delete tags"
on public.call_tags for delete to authenticated
using (
  (
    user_id = (select auth.uid())
    or public.has_workspace_role(workspace_id, array['owner','admin'])
  )
  and public.has_workspace_role(workspace_id, array['owner','admin','member'])
  and exists (
    select 1 from public.call_records cr
    where cr.id = call_tags.call_record_id
      and cr.workspace_id = call_tags.workspace_id
  )
);

-- Exact browser privileges. Provider callbacks and internal processing retain
-- service_role access and continue to bypass RLS.
revoke all on table public.active_calls from public, anon, authenticated;
grant select, insert, update on table public.active_calls to authenticated;

revoke all on table public.call_queues from public, anon, authenticated;
grant select, insert, update, delete on table public.call_queues to authenticated;

revoke all on table public.call_queue_members from public, anon, authenticated;
grant select, insert, update, delete on table public.call_queue_members to authenticated;

revoke all on table public.call_recordings from public, anon, authenticated;
grant select, insert on table public.call_recordings to authenticated;

revoke all on table public.call_records from public, anon, authenticated;
grant select, insert, update on table public.call_records to authenticated;

revoke all on table public.call_scripts from public, anon, authenticated;
grant select, insert, update, delete on table public.call_scripts to authenticated;

revoke all on table public.call_notes from public, anon, authenticated;
grant select, insert, delete on table public.call_notes to authenticated;

revoke all on table public.call_tags from public, anon, authenticated;
grant select, insert, delete on table public.call_tags to authenticated;

commit;
