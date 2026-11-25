-- P0.6 final ingress: race-safe Public API message idempotency.
-- Fail fast on historical conflicts; never delete or rewrite customer data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.inbox_messages
    WHERE source_name = 'Public API'
      AND provider_message_id IS NOT NULL
    GROUP BY workspace_id, provider_message_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Public API inbox_messages contain duplicate workspace/provider_message_id rows';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_public_api_provider_event_unique
  ON public.inbox_messages (workspace_id, provider_message_id)
  WHERE source_name = 'Public API'
    AND provider_message_id IS NOT NULL;;
