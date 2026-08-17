-- Migration: 20260816212000_sales_sequences_schema.sql
-- Additive creation of Sales Sequence automation schema with full multi-tenancy and workspace RLS policies

-- 1. Table: public.sales_sequences
CREATE TABLE IF NOT EXISTS public.sales_sequences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  trigger_type      text NOT NULL DEFAULT 'manual'
                    CHECK (trigger_type IN ('manual', 'lead_created', 'lead_scored', 'deal_stale', 'tag_added')),
  trigger_config    jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'archived')),
  is_default        boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. Table: public.sequence_steps
CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id       uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,
  step_order        integer NOT NULL CHECK (step_order > 0),
  delay_days        integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  delay_hours       integer NOT NULL DEFAULT 0 CHECK (delay_hours >= 0),
  channel           text NOT NULL DEFAULT 'email'
                    CHECK (channel IN ('email', 'whatsapp', 'sms', 'instagram_dm', 'internal_task')),
  action_type       text NOT NULL DEFAULT 'send_message'
                    CHECK (action_type IN ('send_message', 'assign_task', 'update_status', 'add_tag', 'notify_staff')),
  subject           text,
  body_template     text,
  variant_a_body    text,
  variant_b_body    text,
  ab_split_pct      integer DEFAULT 50 CHECK (ab_split_pct BETWEEN 0 AND 100),
  config            jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sequence_steps_order
  ON public.sequence_steps(sequence_id, step_order);

-- 3. Table: public.sequence_enrollments (with direct workspace_id multi-tenancy)
CREATE TABLE IF NOT EXISTS public.sequence_enrollments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sequence_id       uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,
  contact_id        uuid, -- No FK constraint as public.contacts table is not in core schema
  contact_email     text NOT NULL,
  contact_name      text,
  contact_phone     text,
  contact_data      jsonb NOT NULL DEFAULT '{}',
  current_step      integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'paused', 'completed', 'unsubscribed', 'bounced')),
  enrolled_at       timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  next_step_at      timestamptz,
  ab_variant        text CHECK (ab_variant IN ('a', 'b', 'none')) DEFAULT 'none',
  enrolled_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source_deal_id    uuid REFERENCES public.deals(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_enrollments_workspace
  ON public.sequence_enrollments(workspace_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_next_step
  ON public.sequence_enrollments(next_step_at ASC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_enrollments_sequence
  ON public.sequence_enrollments(sequence_id, status);

-- 4. Table: public.sequence_step_executions
CREATE TABLE IF NOT EXISTS public.sequence_step_executions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     uuid NOT NULL REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE,
  step_id           uuid NOT NULL REFERENCES public.sequence_steps(id) ON DELETE CASCADE,
  step_order        integer NOT NULL CHECK (step_order > 0),
  ab_variant_used   text,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  channel_used      text,
  error_message     text,
  executed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_step_executions_enrollment
  ON public.sequence_step_executions(enrollment_id);

-- 5. Updated_at Trigger for sales_sequences
CREATE OR REPLACE FUNCTION public.update_sales_sequences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_sequences_updated_at ON public.sales_sequences;
CREATE TRIGGER trg_sales_sequences_updated_at
  BEFORE UPDATE ON public.sales_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_sales_sequences_updated_at();

-- 6. Enable RLS
ALTER TABLE public.sales_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_step_executions ENABLE ROW LEVEL SECURITY;

-- 7. Workspace-scoped RLS Policies
DROP POLICY IF EXISTS sales_sequences_select ON public.sales_sequences;
CREATE POLICY sales_sequences_select ON public.sales_sequences
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sales_sequences.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sales_sequences_insert ON public.sales_sequences;
CREATE POLICY sales_sequences_insert ON public.sales_sequences
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sales_sequences.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sales_sequences_update ON public.sales_sequences;
CREATE POLICY sales_sequences_update ON public.sales_sequences
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sales_sequences.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sales_sequences_delete ON public.sales_sequences;
CREATE POLICY sales_sequences_delete ON public.sales_sequences
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sales_sequences.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS sequence_steps_select ON public.sequence_steps;
CREATE POLICY sequence_steps_select ON public.sequence_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_sequences s JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id WHERE s.id = sequence_steps.sequence_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_steps_insert ON public.sequence_steps;
CREATE POLICY sequence_steps_insert ON public.sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_sequences s JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id WHERE s.id = sequence_steps.sequence_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_steps_update ON public.sequence_steps;
CREATE POLICY sequence_steps_update ON public.sequence_steps
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_sequences s JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id WHERE s.id = sequence_steps.sequence_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_steps_delete ON public.sequence_steps;
CREATE POLICY sequence_steps_delete ON public.sequence_steps
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_sequences s JOIN public.workspace_members wm ON wm.workspace_id = s.workspace_id WHERE s.id = sequence_steps.sequence_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_enrollments_select ON public.sequence_enrollments;
CREATE POLICY sequence_enrollments_select ON public.sequence_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sequence_enrollments.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_enrollments_insert ON public.sequence_enrollments;
CREATE POLICY sequence_enrollments_insert ON public.sequence_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sequence_enrollments.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_enrollments_update ON public.sequence_enrollments;
CREATE POLICY sequence_enrollments_update ON public.sequence_enrollments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sequence_enrollments.workspace_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_enrollments_delete ON public.sequence_enrollments;
CREATE POLICY sequence_enrollments_delete ON public.sequence_enrollments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = sequence_enrollments.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS sequence_step_executions_select ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_select ON public.sequence_step_executions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sequence_enrollments e JOIN public.workspace_members wm ON wm.workspace_id = e.workspace_id WHERE e.id = sequence_step_executions.enrollment_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_step_executions_insert ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_insert ON public.sequence_step_executions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sequence_enrollments e JOIN public.workspace_members wm ON wm.workspace_id = e.workspace_id WHERE e.id = sequence_step_executions.enrollment_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_step_executions_update ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_update ON public.sequence_step_executions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sequence_enrollments e JOIN public.workspace_members wm ON wm.workspace_id = e.workspace_id WHERE e.id = sequence_step_executions.enrollment_id AND wm.user_id = auth.uid()));

DROP POLICY IF EXISTS sequence_step_executions_delete ON public.sequence_step_executions;
CREATE POLICY sequence_step_executions_delete ON public.sequence_step_executions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sequence_enrollments e JOIN public.workspace_members wm ON wm.workspace_id = e.workspace_id WHERE e.id = sequence_step_executions.enrollment_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

-- 8. Explicit Role Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_sequences TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_steps TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_enrollments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_step_executions TO authenticated, service_role;
