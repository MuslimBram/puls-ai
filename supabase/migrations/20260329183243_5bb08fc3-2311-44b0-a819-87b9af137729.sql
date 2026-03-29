-- Table to log all PayPal webhook events
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  event_type text NOT NULL,
  resource_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'received',
  error_message text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_paypal_webhook_event_id ON public.paypal_webhook_events(event_id);
CREATE INDEX idx_paypal_webhook_status ON public.paypal_webhook_events(status);

ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook events"
  ON public.paypal_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));