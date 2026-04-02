-- Telegram bot state (singleton for offset tracking)
CREATE TABLE IF NOT EXISTS public.telegram_bot_state (
  id int PRIMARY KEY CHECK (id = 1),
  update_offset bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0) ON CONFLICT DO NOTHING;

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;

-- Only service_role can access
CREATE POLICY "Service role only for telegram_bot_state"
  ON public.telegram_bot_state
  FOR ALL
  USING (false);

-- Telegram messages table
CREATE TABLE IF NOT EXISTS public.telegram_messages (
  update_id bigint PRIMARY KEY,
  chat_id bigint NOT NULL,
  text text,
  raw_update jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat_id ON public.telegram_messages (chat_id);

ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- Admins can read telegram messages
CREATE POLICY "Admins can read telegram_messages"
  ON public.telegram_messages
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts (no authenticated insert policy needed - handled by service_role)
