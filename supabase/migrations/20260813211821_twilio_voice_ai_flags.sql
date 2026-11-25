
-- ══════════════════════════════════════════════════════════════════
-- TWILIO VOICE AI — FEATURE FLAGS + ConversationRelay ARCHITECTURE
-- ══════════════════════════════════════════════════════════════════

-- Per-channel feature flags (non-destructive additions)
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS recording_enabled       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transcription_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_auto_reply_sms       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_ai_enabled        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_ai_provider       text    DEFAULT 'pulse_ai_router',
  ADD COLUMN IF NOT EXISTS ai_receptionist_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_handoff_number    text;

COMMENT ON COLUMN channels.voice_ai_enabled IS
  'Feature flag for Pulse AI Voice Brain / ConversationRelay. Normal human calling works when false.';
COMMENT ON COLUMN channels.ai_auto_reply_sms IS
  'AI auto-reply for SMS only when explicitly enabled. Never auto-replies when false.';
COMMENT ON COLUMN channels.recording_enabled IS
  'Per-workspace consent flag — recording must be explicitly enabled.';
COMMENT ON COLUMN channels.transcription_enabled IS
  'Transcription only runs when recording_enabled AND transcription_enabled are both true.';

-- ConversationRelay AI voice sessions (for WebSocket persistence)
CREATE TABLE IF NOT EXISTS voice_ai_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sid            text UNIQUE NOT NULL,
  workspace_id        uuid,
  channel_id          uuid REFERENCES channels(id),
  caller_number       text,
  callee_number       text,
  direction           text DEFAULT 'inbound',
  ws_session_id       text,               -- ConversationRelay session ID
  session_status      text DEFAULT 'initializing',
  -- Context fed to AI
  business_context    jsonb DEFAULT '{}', -- digital twin snapshot
  customer_context    jsonb DEFAULT '{}', -- customer/lead history
  conversation_turns  jsonb DEFAULT '[]', -- running transcript
  -- Detection flags
  human_handoff_requested boolean DEFAULT false,
  handoff_reason      text,
  lead_qualified      boolean DEFAULT false,
  booking_requested   boolean DEFAULT false,
  -- AI provider
  ai_provider         text DEFAULT 'claude-sonnet-4-6',
  -- Timestamps
  started_at          timestamptz DEFAULT now(),
  ended_at            timestamptz,
  duration_seconds    integer,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT vai_status CHECK (session_status IN (
    'initializing','active','human_handoff','ended','error'
  ))
);

COMMENT ON TABLE voice_ai_sessions IS
  'ConversationRelay session state. voice_ai_enabled=false means normal human calling — AI sessions never created.';

ALTER TABLE voice_ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_read_sessions" ON voice_ai_sessions
  FOR SELECT USING (
    EXISTS(SELECT 1 FROM channels c WHERE c.id=channel_id AND c.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
  );
CREATE POLICY "service_manage_sessions" ON voice_ai_sessions
  FOR ALL USING (auth.uid() IS NULL);  -- service_role bypass

-- Duplicate webhook protection
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL DEFAULT 'twilio',
  event_id      text NOT NULL,
  workspace_id  uuid,
  received_at   timestamptz DEFAULT now(),
  UNIQUE(provider, event_id)
);

COMMENT ON TABLE processed_webhook_events IS
  'Idempotency table. Duplicate Twilio webhooks (CallSid + StatusCallback) are silently dropped.';

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_webhooks" ON processed_webhook_events
  FOR ALL USING (auth.uid() IS NULL);

CREATE INDEX IF NOT EXISTS idx_voice_ai_call_sid ON voice_ai_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_processed_events ON processed_webhook_events(provider, event_id);
;
