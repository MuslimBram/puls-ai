
-- 1. Message delivery state tracking
CREATE TABLE IF NOT EXISTS public.message_delivery_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  broadcast_recipient_id UUID REFERENCES public.broadcast_recipients(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  provider_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'accepted',
  failure_reason TEXT,
  failure_code TEXT,
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_timestamp TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_delivery_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own delivery states"
  ON public.message_delivery_states FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_delivery_provider_msg
  ON public.message_delivery_states (provider_message_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_delivery_inbox
  ON public.message_delivery_states (inbox_message_id);
CREATE INDEX IF NOT EXISTS idx_delivery_status
  ON public.message_delivery_states (user_id, delivery_status, channel_type);

-- Add columns to inbox_messages
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'accepted';
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';
ALTER TABLE public.inbox_messages ADD COLUMN IF NOT EXISTS media_attachments JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_inbox_provider_msg
  ON public.inbox_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- 2. Enhance existing conversation_threads
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS unread_count INT DEFAULT 0;
ALTER TABLE public.conversation_threads ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversation_threads_user_channel_contact'
  ) THEN
    ALTER TABLE public.conversation_threads
      ADD CONSTRAINT conversation_threads_user_channel_contact
      UNIQUE (user_id, channel_type, contact_identifier);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_threads_last_message
  ON public.conversation_threads (user_id, last_message_at DESC);

-- 3. WhatsApp message templates
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en',
  category TEXT NOT NULL DEFAULT 'MARKETING',
  status TEXT NOT NULL DEFAULT 'draft',
  header_type TEXT,
  header_content TEXT,
  body_text TEXT NOT NULL,
  footer_text TEXT,
  buttons JSONB DEFAULT '[]',
  sample_values JSONB DEFAULT '{}',
  rejection_reason TEXT,
  meta_template_id TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_name, template_language)
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own WA templates"
  ON public.whatsapp_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Media attachments
CREATE TABLE IF NOT EXISTS public.message_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  file_size BIGINT,
  provider_media_id TEXT,
  provider_url TEXT,
  storage_path TEXT,
  thumbnail_path TEXT,
  duration_seconds INT,
  caption TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own media"
  ON public.message_media FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own media"
  ON public.message_media FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_media_message
  ON public.message_media (inbox_message_id);

-- 5. Upsert thread helper
CREATE OR REPLACE FUNCTION public.upsert_conversation_thread(
  _user_id UUID,
  _channel_type TEXT,
  _contact_identifier TEXT,
  _contact_name TEXT,
  _message_preview TEXT,
  _direction TEXT DEFAULT 'inbound'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _thread_id UUID;
BEGIN
  INSERT INTO public.conversation_threads (
    user_id, channel_type, contact_identifier, contact_name,
    last_message_at, last_message_preview, message_count, unread_count
  )
  VALUES (
    _user_id, _channel_type, _contact_identifier, _contact_name,
    now(), LEFT(_message_preview, 200), 1,
    CASE WHEN _direction = 'inbound' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, channel_type, contact_identifier)
  DO UPDATE SET
    last_message_at = now(),
    last_message_preview = LEFT(_message_preview, 200),
    message_count = conversation_threads.message_count + 1,
    unread_count = CASE
      WHEN _direction = 'inbound' THEN conversation_threads.unread_count + 1
      ELSE conversation_threads.unread_count
    END,
    contact_name = COALESCE(EXCLUDED.contact_name, conversation_threads.contact_name),
    updated_at = now()
  RETURNING id INTO _thread_id;

  RETURN _thread_id;
END;
$$;
