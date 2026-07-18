-- supabase/migrations/0157_remaining_schemas.sql
-- Email campaigns + Appointments + Google sync tables

-- ── 1. EMAIL CAMPAIGNS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  name          text NOT NULL,
  subject       text NOT NULL,
  body_html     text NOT NULL,
  body_text     text,
  from_name     text NOT NULL DEFAULT 'Pulse AI',
  from_email    text NOT NULL DEFAULT 'noreply@kohablerjeve.top',
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled')),
  type          text NOT NULL DEFAULT 'broadcast'
                CHECK (type IN ('broadcast','drip','trigger','newsletter')),
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  recipient_count integer DEFAULT 0,
  open_count    integer DEFAULT 0,
  click_count   integer DEFAULT 0,
  unsubscribe_count integer DEFAULT 0,
  tags          text[] DEFAULT '{}',
  ab_test       boolean DEFAULT false,
  subject_b     text,
  body_html_b   text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_campaign_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_email text NOT NULL,
  contact_name  text,
  variant       text DEFAULT 'a',
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','unsubscribed')),
  opened_at     timestamptz,
  clicked_at    timestamptz,
  tracking_id   text UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  sent_at       timestamptz,
  UNIQUE(campaign_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_status
  ON public.email_campaign_sends(campaign_id, status);

-- ── 2. APPOINTMENTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  name            text NOT NULL,
  duration_min    integer NOT NULL DEFAULT 60,
  price_lek       integer DEFAULT 0,
  description     text,
  color           text DEFAULT '#3b82f6',
  is_active       boolean DEFAULT true,
  max_per_day     integer DEFAULT 10,
  buffer_min      integer DEFAULT 15,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  type_id         uuid REFERENCES public.appointment_types(id) ON DELETE SET NULL,
  -- Klienti
  client_name     text NOT NULL,
  client_email    text,
  client_phone    text,
  customer_id     uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  -- Koha
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  timezone        text DEFAULT 'Europe/Tirane',
  -- Statusi
  status          text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('pending','confirmed','cancelled','no_show','completed')),
  notes           text,
  cancellation_reason text,
  -- Konfirmimi
  confirmation_token text UNIQUE DEFAULT encode(gen_random_bytes(16),'hex'),
  confirmed_at    timestamptz,
  reminder_sent   boolean DEFAULT false,
  -- Financiare
  amount_lek      integer DEFAULT 0,
  payment_status  text DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid','paid','refunded')),
  -- Source
  source          text DEFAULT 'manual',
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_time
  ON public.appointments(workspace_id, starts_at ASC)
  WHERE status NOT IN ('cancelled','no_show');

CREATE INDEX IF NOT EXISTS idx_appointments_date
  ON public.appointments(workspace_id, DATE(starts_at));

-- ── 3. AVAILABILITY RULES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.availability_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  day_of_week     integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  is_available    boolean DEFAULT true,
  UNIQUE(workspace_id, day_of_week)
);

-- Default: E hënë-E premte 09:00-17:00
INSERT INTO public.availability_rules (workspace_id, day_of_week, start_time, end_time)
SELECT gen_random_uuid(), d, '09:00', '17:00'
FROM generate_series(1,5) d
WHERE NOT EXISTS (SELECT 1 FROM public.availability_rules LIMIT 1)
LIMIT 0; -- bosh, plotësohet gjatë onboarding-ut

-- ── 4. GOOGLE SYNC LOG ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  service       text NOT NULL CHECK (service IN ('calendar','drive','gmail','ads')),
  action        text NOT NULL,
  status        text NOT NULL DEFAULT 'success',
  items_synced  integer DEFAULT 0,
  error         text,
  synced_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 5. VICIDIAL CDR ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  vicidial_id     text UNIQUE,
  caller_phone    text,
  agent_name      text,
  direction       text CHECK (direction IN ('inbound','outbound')),
  duration_sec    integer DEFAULT 0,
  disposition     text,
  recording_url   text,
  ai_transcript   text,
  ai_summary      text,
  ai_sentiment    text,
  lead_detected   boolean DEFAULT false,
  customer_id     uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  called_at       timestamptz NOT NULL DEFAULT now(),
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_workspace
  ON public.call_records(workspace_id, called_at DESC);

-- ── 6. RLS ─────────────────────────────────────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'email_campaigns','email_campaign_sends',
    'appointment_types','appointments','availability_rules',
    'google_sync_log','call_records'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END; $$;
