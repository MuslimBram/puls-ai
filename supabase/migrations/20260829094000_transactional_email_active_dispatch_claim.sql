-- Enforce one active transactional-email dispatch per message_id while preserving
-- failed/suppressed history and allowing legitimate retries after failure.

-- Historical rows may contain a stale pending audit row shadowed by a sent row.
-- Remove only that redundant pending row; failed/suppressed attempts remain intact.
DELETE FROM public.email_send_log AS pending_log
WHERE pending_log.status = 'pending'
  AND pending_log.message_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.email_send_log AS sent_log
    WHERE sent_log.message_id = pending_log.message_id
      AND sent_log.status = 'sent'
      AND sent_log.id <> pending_log.id
  );

-- Abort rather than guessing if any other active duplicate remains.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND status IN ('pending', 'sent')
    GROUP BY message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'transactional email active dispatch duplicates remain; refusing to create uniqueness boundary';
  END IF;
END
$$;

-- The former sent-only uniqueness boundary is too late to prevent two workers
-- from sending concurrently. Replace it with an active-dispatch boundary.
DROP INDEX IF EXISTS public.idx_email_send_log_message_sent_unique;

CREATE UNIQUE INDEX idx_email_send_log_message_active_unique
  ON public.email_send_log (message_id)
  WHERE message_id IS NOT NULL
    AND status IN ('pending', 'sent');
