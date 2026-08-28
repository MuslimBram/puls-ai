begin;

-- Backfill legacy workspace-less records only when the owner has exactly one workspace.
update public.channels c
set workspace_id = wm.workspace_id
from public.workspace_members wm
where c.workspace_id is null
  and c.user_id = wm.user_id
  and (select count(*) from public.workspace_members wm2 where wm2.user_id = c.user_id) = 1;

update public.conversation_threads ct
set workspace_id = wm.workspace_id
from public.workspace_members wm
where ct.workspace_id is null
  and ct.user_id = wm.user_id
  and (select count(*) from public.workspace_members wm2 where wm2.user_id = ct.user_id) = 1;

-- These core tenant-owned resources must always belong to a workspace.
alter table public.channels alter column workspace_id set not null;
alter table public.conversation_threads alter column workspace_id set not null;
alter table public.leads alter column workspace_id set not null;
alter table public.business_profiles alter column workspace_id set not null;

commit;
