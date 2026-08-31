-- Corrections discovered during pre-PR review of the LEAH foundation.

alter table public.leah_project_artifacts
  drop constraint leah_artifact_supersedes_fk,
  add constraint leah_artifact_supersedes_fk
    foreign key (supersedes_id, workspace_id)
    references public.leah_project_artifacts(id, workspace_id)
    on delete set null (supersedes_id);

alter table public.leah_secret_access_log
  drop constraint leah_secret_access_execution_fk,
  add constraint leah_secret_access_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id)
    on delete set null (execution_id);

alter table public.leah_usage_events
  drop constraint leah_usage_execution_fk,
  add constraint leah_usage_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id)
    on delete set null (execution_id);

-- has_workspace_role includes direct workspace owners as well as workspace_members
-- and mapped temporary/access assignments; use it consistently for LEAH reads.
drop policy leah_projects_read on public.leah_projects;
create policy leah_projects_read on public.leah_projects
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_artifacts_read on public.leah_project_artifacts;
create policy leah_artifacts_read on public.leah_project_artifacts
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_executions_read on public.leah_executions;
create policy leah_executions_read on public.leah_executions
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_tasks_read on public.leah_tasks;
create policy leah_tasks_read on public.leah_tasks
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_context_read on public.leah_execution_context;
create policy leah_context_read on public.leah_execution_context
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_project_memory_read on public.leah_project_memory;
create policy leah_project_memory_read on public.leah_project_memory
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_preferences_read on public.leah_preferences;
create policy leah_preferences_read on public.leah_preferences
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));

drop policy leah_semantic_memory_read on public.leah_semantic_memory;
create policy leah_semantic_memory_read on public.leah_semantic_memory
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));
