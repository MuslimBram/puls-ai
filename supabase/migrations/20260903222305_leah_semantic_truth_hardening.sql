-- MR8A follow-up hardening: canonical settlement ACL + strict task authority shape.

-- Remove migration-only fail-closed overloads.
drop function if exists public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer);
drop function if exists public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer);

-- CHECK constraints treat NULL as unknown/pass, so require lease hash non-null
-- explicitly in the task-authority branch.
alter table public.leah_memory_embedding_attempts
  drop constraint leah_memory_embedding_attempt_authority_ck,
  add constraint leah_memory_embedding_attempt_authority_ck check (
    (
      actor_id is not null
      and task_id is null
      and execution_id is null
      and lease_token_hash is null
    )
    or
    (
      actor_id is null
      and task_id is not null
      and execution_id is not null
      and lease_token_hash is not null
      and lease_token_hash ~ '^[0-9a-f]{64}$'
    )
  );

-- Canonical six-argument task settlement functions are service-only.
revoke all on function public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer)
  to service_role;
grant execute on function public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,integer)
  to service_role;
;
