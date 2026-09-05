-- Corrections discovered during adversarial review of the LEAH foundation.

-- Partial SET NULL keeps immutable tenant keys intact on PostgreSQL 17.
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

-- Session rows are bound to real auth users and only accept SHA-256 hex hashes.
alter table public.leah_access_sessions
  add constraint leah_access_sessions_user_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  add constraint leah_access_sessions_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  add constraint leah_access_sessions_expiry_check
    check (expires_at > created_at);

alter table public.leah_preferences
  add constraint leah_preferences_user_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

-- Idempotency is project-scoped. Reusing the same client key in another project
-- must never replay an execution belonging to a different project.
drop index public.leah_executions_idempotency_uq;
create unique index leah_executions_idempotency_uq
  on public.leah_executions(workspace_id, project_id, idempotency_key)
  where idempotency_key is not null;
alter table public.leah_executions
  add constraint leah_executions_idempotency_key_check
    check (idempotency_key is null or length(idempotency_key) between 1 and 200);

-- Usage events will later drive metering/billing. Make duplicate charging structurally
-- impossible before any writer is added.
alter table public.leah_usage_events
  add column event_key text not null,
  add constraint leah_usage_events_event_key_check
    check (length(event_key) between 1 and 200),
  add constraint leah_usage_events_workspace_event_key_key
    unique (workspace_id, event_key);

-- Secret metadata must not be able to reference another workspace's Vault metadata,
-- even under a future service bug.
alter table public.vault_secret_refs
  add constraint vault_secret_refs_id_workspace_key unique (id, workspace_id);

alter table public.leah_secret_registry
  drop constraint leah_secret_registry_vault_ref_id_fkey,
  add constraint leah_secret_registry_vault_ref_workspace_fk
    foreign key (vault_ref_id, workspace_id)
    references public.vault_secret_refs(id, workspace_id)
    on delete set null (vault_ref_id),
  drop constraint leah_secret_registry_rotated_from_fkey,
  add constraint leah_secret_registry_rotated_from_workspace_fk
    foreign key (rotated_from, workspace_id)
    references public.leah_secret_registry(id, workspace_id)
    on delete set null (rotated_from);

-- has_workspace_role includes direct workspace owners as well as workspace_members
-- and mapped temporary/access assignments; use it consistently for shared LEAH reads.
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

-- Workspace-level preferences are shared. User-level preferences are private to
-- that user even from other members of the same workspace.
drop policy leah_preferences_read on public.leah_preferences;
create policy leah_preferences_read on public.leah_preferences
  for select to authenticated
  using (
    public.has_workspace_role(workspace_id, array['owner','admin','member']::text[])
    and (user_id is null or user_id = (select auth.uid()))
  );

drop policy leah_semantic_memory_read on public.leah_semantic_memory;
create policy leah_semantic_memory_read on public.leah_semantic_memory
  for select to authenticated
  using (public.has_workspace_role(workspace_id, array['owner','admin','member']::text[]));
