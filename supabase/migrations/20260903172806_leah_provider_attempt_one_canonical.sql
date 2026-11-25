-- MR7-A: exactly one successful provider attempt may become canonical for a
-- logical request. Application routing already stops at first success; this makes
-- the invariant structural in PostgreSQL as well.

create unique index leah_provider_attempts_one_canonical_idx
  on public.leah_provider_attempts(workspace_id, logical_request_id)
  where canonical_result;
;
