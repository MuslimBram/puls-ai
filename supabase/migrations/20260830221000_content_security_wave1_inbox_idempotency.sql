-- P0.6 content-security ingress wave 1 — race-safe Inbox provider IDs.
-- Additive only. Production rollout must stop rather than silently deduplicate
-- historical rows if a provider-specific collision already exists.

BEGIN;

DO $$
DECLARE
  v_channel_type text;
BEGIN
  FOREACH v_channel_type IN ARRAY ARRAY['whatsapp','telegram','instagram','facebook'] LOOP
    IF EXISTS (
      SELECT 1
      FROM public.inbox_messages
      WHERE channel_type = v_channel_type
        AND workspace_id IS NOT NULL
        AND channel_id IS NOT NULL
        AND provider_message_id IS NOT NULL
      GROUP BY workspace_id, channel_id, provider_message_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'P0.6 inbox idempotency precondition failed: duplicate % provider_message_id rows exist', v_channel_type;
    END IF;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_whatsapp_provider_event_unique
  ON public.inbox_messages(workspace_id, channel_id, provider_message_id)
  WHERE channel_type = 'whatsapp'
    AND workspace_id IS NOT NULL
    AND channel_id IS NOT NULL
    AND provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_telegram_provider_event_unique
  ON public.inbox_messages(workspace_id, channel_id, provider_message_id)
  WHERE channel_type = 'telegram'
    AND workspace_id IS NOT NULL
    AND channel_id IS NOT NULL
    AND provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_instagram_provider_event_unique
  ON public.inbox_messages(workspace_id, channel_id, provider_message_id)
  WHERE channel_type = 'instagram'
    AND workspace_id IS NOT NULL
    AND channel_id IS NOT NULL
    AND provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_facebook_provider_event_unique
  ON public.inbox_messages(workspace_id, channel_id, provider_message_id)
  WHERE channel_type = 'facebook'
    AND workspace_id IS NOT NULL
    AND channel_id IS NOT NULL
    AND provider_message_id IS NOT NULL;

COMMIT;
