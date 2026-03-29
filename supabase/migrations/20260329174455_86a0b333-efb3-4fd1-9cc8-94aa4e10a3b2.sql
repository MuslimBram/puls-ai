
CREATE TABLE public.paypal_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id),
  paypal_order_id text NOT NULL,
  paypal_payer_id text,
  payer_email text,
  payer_name text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  payment_type text NOT NULL DEFAULT 'one_time',
  plan_key text,
  status text NOT NULL DEFAULT 'pending',
  paypal_capture_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paypal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own PayPal transactions"
  ON public.paypal_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all PayPal transactions"
  ON public.paypal_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_paypal_transactions_user ON public.paypal_transactions(user_id);
CREATE INDEX idx_paypal_transactions_order ON public.paypal_transactions(paypal_order_id);
