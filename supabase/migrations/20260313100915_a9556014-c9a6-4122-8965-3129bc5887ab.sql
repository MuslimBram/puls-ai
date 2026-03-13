
CREATE TABLE public.pricing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL UNIQUE,
  monthly_price numeric NOT NULL DEFAULT 0,
  annual_price numeric NOT NULL DEFAULT 0,
  is_donation boolean NOT NULL DEFAULT false,
  donation_label text DEFAULT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT NULL
);

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing
CREATE POLICY "Anyone can read pricing_settings" ON public.pricing_settings
  FOR SELECT TO authenticated USING (true);

-- Only admins can update
CREATE POLICY "Admins can update pricing_settings" ON public.pricing_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pricing_settings" ON public.pricing_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed default prices
INSERT INTO public.pricing_settings (plan_key, monthly_price, annual_price, is_donation, donation_label) VALUES
  ('standard', 29, 290, false, null),
  ('professional', 79, 790, false, null),
  ('advanced', 149, 1490, false, null),
  ('enterprise', 399, 3990, false, null),
  ('donation_once', 5, 0, true, 'One-time Support'),
  ('donation_monthly', 5, 0, true, 'Monthly Support');
