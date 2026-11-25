-- MR8A migration-signature guard.
-- These fail-closed overloads exist only so stacked migration replay can safely
-- revoke an obsolete seven-argument settlement shape before the canonical
-- six-argument functions are installed. They are dropped immediately by the
-- MR8A hardening migration and can never perform a side effect.

create or replace function public.leah_finalize_semantic_embedding_for_task(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _embedding_text text,
  _provider_request_id text,
  _obsolete text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Obsolete MR8A settlement signature is fail-closed';
end;
$$;

create or replace function public.leah_fail_semantic_embedding_for_task(
  _task_id uuid,
  _lease_token uuid,
  _attempt_id uuid,
  _outcome text,
  _error_code text,
  _obsolete text,
  _latency_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Obsolete MR8A failure signature is fail-closed';
end;
$$;

revoke all on function public.leah_finalize_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.leah_fail_semantic_embedding_for_task(uuid,uuid,uuid,text,text,text,integer)
  from public, anon, authenticated;
;
