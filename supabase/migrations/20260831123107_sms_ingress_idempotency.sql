-- P0.6 PRE2C — Twilio SMS provider-message idempotency.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inbox_messages
    WHERE channel_type = 'sms'
      AND provider_message_id IS NOT NULL
    GROUP BY workspace_id, provider_message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SMS provider_message_id duplicates must be resolved before adding the unique boundary';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_sms_event_unique
  ON public.inbox_messages (workspace_id, provider_message_id)
  WHERE channel_type = 'sms' AND provider_message_id IS NOT NULL;
