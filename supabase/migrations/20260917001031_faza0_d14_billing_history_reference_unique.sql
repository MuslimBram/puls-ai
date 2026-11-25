-- FAZA 0 / D14 — one invoice per payment reference
--
-- process-manual-payment deduplicates billing_history by reference_id before
-- inserting, so a retried admin approval reuses the existing invoice instead of
-- writing a second one. That check is a read-then-write and is therefore racy
-- under two concurrent approvals of the same payment. This index makes the
-- invariant structural: the database itself refuses a second billing row for
-- the same reference. The function's lookup remains the fast path; this is the
-- backstop.
--
-- Non-destructive: adds one partial unique index. No data is modified.
-- public.billing_history held 0 rows at authoring time, so the index cannot
-- fail to build on existing data. NULL reference_id is excluded, so rows from
-- other payment paths that carry no reference are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS billing_history_reference_id_unique
  ON public.billing_history (reference_id)
  WHERE reference_id IS NOT NULL;;
