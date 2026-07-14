-- supabase/migrations/0152_phase3_sales_automation_complete.sql
-- ============================================================
-- FAZA 3 — Sales Automation i plotë (65% → 100%)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. SALES SEQUENCES — Sekuencat e follow-up automatik
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_sequences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL,
  name              text NOT NULL,
  description       text,
  trigger_type      text NOT NULL DEFAULT 'manual'
                    CHECK (trigger_type IN (
                      'manual',        -- stafi nis manualisht
                      'lead_created',  -- automatikisht kur krijohet lead
                      'lead_scored',   -- kur lead kalon threshold
                      'deal_stale',    -- kur deal nuk ka aktivitet X ditë
                      'tag_added'      -- kur shtohet tag specifik
                    )),
  trigger_config    jsonb NOT NULL DEFAULT '{}',
  -- p.sh. {"min_score": 0.7} për lead_scored
  -- p.sh. {"stale_days": 5} për deal_stale

  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','archived')),
  is_default        boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 2. SEQUENCE STEPS — Hapat e secilit sekuencë
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,
  step_order        integer NOT NULL,
  delay_days        integer NOT NULL DEFAULT 0,   -- 0 = menjëherë
  delay_hours       integer NOT NULL DEFAULT 0,   -- shtesë orësh
  channel           text NOT NULL DEFAULT 'email'
                    CHECK (channel IN ('email','whatsapp','sms','instagram_dm','internal_task')),
  action_type       text NOT NULL DEFAULT 'send_message'
                    CHECK (action_type IN (
                      'send_message',    -- dërgo mesazh
                      'assign_task',     -- cakto task te stafit
                      'update_status',   -- ndryshon statusin e deal
                      'add_tag',         -- shto tag te kontaktit
                      'notify_staff'     -- njofto stafin me email/push
                    )),
  -- Mesazhi
  subject           text,                          -- për email
  body_template     text,                          -- me variabla: {{name}}, {{business}}, {{plan}}
  -- A/B Testing
  variant_a_body    text,
  variant_b_body    text,
  ab_split_pct      integer DEFAULT 50 CHECK (ab_split_pct BETWEEN 0 AND 100),
  -- Konfigurim
  config            jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_order
  ON public.sequence_steps(sequence_id, step_order);

-- ----------------------------------------------------------------
-- 3. SEQUENCE ENROLLMENTS — Kush është brenda secilit sekuencë
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,
  -- Kontakti
  contact_id        uuid,                          -- customers.id nëse ekziston
  contact_email     text NOT NULL,
  contact_name      text,
  contact_phone     text,
  contact_data      jsonb NOT NULL DEFAULT '{}',   -- variabla shtesë për template
  -- Progresi
  current_step      integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','completed','unsubscribed','bounced')),
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  next_step_at      timestamptz,
  -- A/B variant i caktuar
  ab_variant        text CHECK (ab_variant IN ('a','b','none')) DEFAULT 'none',
  -- Meta
  enrolled_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_lead_id    uuid,
  source_deal_id    uuid
);

CREATE INDEX IF NOT EXISTS idx_enrollments_next_step
  ON public.sequence_enrollments(next_step_at ASC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_sequence
  ON public.sequence_enrollments(sequence_id, status);

-- ----------------------------------------------------------------
-- 4. STEP EXECUTIONS — Log i ekzekutimeve
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequence_step_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     uuid NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  step_id           uuid NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  step_order        integer NOT NULL,
  ab_variant_used   text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','delivered','failed','skipped')),
  channel_used      text,
  error_message     text,
  executed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------
-- 5. ZGJERIMI I deals (shto fusha të nevojshme)
-- ----------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='deals' AND column_name='last_activity_at'
  ) THEN
    ALTER TABLE public.deals
      ADD COLUMN last_activity_at timestamptz DEFAULT now(),
      ADD COLUMN days_stale        integer GENERATED ALWAYS AS (
        EXTRACT(DAY FROM now() - COALESCE(last_activity_at, created_at))::integer
      ) STORED,
      ADD COLUMN sequence_id       uuid REFERENCES public.sales_sequences(id) ON DELETE SET NULL,
      ADD COLUMN enrollment_id     uuid REFERENCES public.sequence_enrollments(id) ON DELETE SET NULL;
  END IF;
END; $$;

-- ----------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.sales_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_step_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_sequences" ON public.sales_sequences
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = sales_sequences.workspace_id
              AND wm.user_id = auth.uid())
  );

CREATE POLICY "sequence_steps_via_sequence" ON public.sequence_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sales_sequences ss
      JOIN public.workspace_members wm ON wm.workspace_id = ss.workspace_id
      WHERE ss.id = sequence_steps.sequence_id AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "enrollments_via_sequence" ON public.sequence_enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sales_sequences ss
      JOIN public.workspace_members wm ON wm.workspace_id = ss.workspace_id
      WHERE ss.id = sequence_enrollments.sequence_id AND wm.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- 7. SEED: 3 sekuenca default
-- ----------------------------------------------------------------
-- SHENIM: Plotësohen pas login-it të parë me workspace_id real.
-- Shto nga UI ose nga migration me workspace_id specifik.
