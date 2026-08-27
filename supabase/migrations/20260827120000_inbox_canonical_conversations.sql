-- Canonical Inbox conversations: workspace-scoped threads and legacy backfill.
-- This keeps one conversation per workspace/channel/contact and removes the
-- message-page split that previously duplicated conversations in the UI.

ALTER TABLE public.conversation_threads
  DROP CONSTRAINT IF EXISTS conversation_threads_user_channel_contact;
DROP INDEX IF EXISTS public.conversation_threads_user_channel_contact;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_user_workspace_channel_contact
  ON public.conversation_threads
  (user_id, workspace_id, channel_type, contact_identifier)
  NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION public.upsert_conversation_thread(
  _user_id uuid,
  _workspace_id uuid,
  _channel_type text,
  _contact_identifier text,
  _contact_name text,
  _message_preview text,
  _direction text DEFAULT 'inbound'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _thread_id uuid;
BEGIN
  IF _user_id IS NULL OR _channel_type IS NULL OR NULLIF(btrim(_contact_identifier), '') IS NULL THEN
    RAISE EXCEPTION 'user_id, channel_type and contact_identifier are required';
  END IF;

  INSERT INTO public.conversation_threads (
    user_id,
    workspace_id,
    channel_type,
    contact_identifier,
    contact_name,
    last_message_at,
    last_message_preview,
    message_count,
    unread_count
  )
  VALUES (
    _user_id,
    _workspace_id,
    _channel_type,
    _contact_identifier,
    _contact_name,
    now(),
    left(_message_preview, 200),
    1,
    CASE WHEN _direction = 'inbound' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, workspace_id, channel_type, contact_identifier)
  DO UPDATE SET
    last_message_at = now(),
    last_message_preview = left(_message_preview, 200),
    message_count = coalesce(conversation_threads.message_count, 0) + 1,
    unread_count = CASE
      WHEN _direction = 'inbound' THEN coalesce(conversation_threads.unread_count, 0) + 1
      ELSE coalesce(conversation_threads.unread_count, 0)
    END,
    contact_name = coalesce(EXCLUDED.contact_name, conversation_threads.contact_name),
    updated_at = now()
  RETURNING id INTO _thread_id;

  RETURN _thread_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_conversation_thread(
  uuid, uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_conversation_thread(
  uuid, uuid, text, text, text, text, text
) TO service_role;

-- Attach the workspace to historical threads from already-linked messages.
UPDATE public.conversation_threads t
SET workspace_id = source.workspace_id,
    updated_at = now()
FROM (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    workspace_id
  FROM public.inbox_messages
  WHERE thread_id IS NOT NULL
    AND workspace_id IS NOT NULL
  ORDER BY thread_id, message_timestamp DESC
) source
WHERE t.id = source.thread_id
  AND t.workspace_id IS DISTINCT FROM source.workspace_id;

-- Link historical inbound messages that predate canonical thread persistence.
UPDATE public.inbox_messages m
SET thread_id = t.id,
    updated_at = now()
FROM public.conversation_threads t
WHERE m.thread_id IS NULL
  AND coalesce(m.direction, 'inbound') = 'inbound'
  AND t.user_id = m.user_id
  AND t.workspace_id IS NOT DISTINCT FROM m.workspace_id
  AND t.channel_type = m.channel_type
  AND t.contact_identifier = CASE
    WHEN m.channel_type = 'telegram'
      THEN regexp_replace(coalesce(m.sender_identifier, ''), '^telegram:', '')
    ELSE coalesce(m.sender_identifier, '')
  END;

-- Rebuild thread counters from canonical message rows.
UPDATE public.conversation_threads t
SET message_count = stats.message_count,
    unread_count = stats.unread_count,
    last_message_at = stats.last_message_at,
    last_message_preview = stats.last_message_preview,
    updated_at = now()
FROM (
  SELECT
    thread_id,
    count(*)::integer AS message_count,
    count(*) FILTER (WHERE is_unread)::integer AS unread_count,
    max(message_timestamp) AS last_message_at,
    (array_agg(message_content ORDER BY message_timestamp DESC))[1] AS last_message_preview
  FROM public.inbox_messages
  WHERE thread_id IS NOT NULL
  GROUP BY thread_id
) stats
WHERE t.id = stats.thread_id;
