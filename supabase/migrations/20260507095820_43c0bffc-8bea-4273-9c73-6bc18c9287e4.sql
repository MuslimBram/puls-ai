
-- Drip email tracking + trial extension support
CREATE TABLE IF NOT EXISTS public.drip_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_name text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE (user_id, template_name)
);

ALTER TABLE public.drip_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drip_log_owner_select" ON public.drip_email_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_drip_log_user ON public.drip_email_log(user_id, template_name);

-- Trial extension tracking on subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_extended_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_extension_days integer DEFAULT 0;
