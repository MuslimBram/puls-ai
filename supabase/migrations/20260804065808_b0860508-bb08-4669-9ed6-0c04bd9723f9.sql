ALTER TABLE public.pricing_settings ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ALL';

UPDATE public.pricing_settings SET monthly_price = 9900,  annual_price = 100980, currency = 'ALL' WHERE plan_key = 'standard';
UPDATE public.pricing_settings SET monthly_price = 19900, annual_price = 202980, currency = 'ALL' WHERE plan_key = 'growth';
UPDATE public.pricing_settings SET monthly_price = 39900, annual_price = 406980, currency = 'ALL' WHERE plan_key = 'professional';
UPDATE public.pricing_settings SET monthly_price = 79900, annual_price = 814980, currency = 'ALL' WHERE plan_key = 'enterprise';

CREATE TABLE IF NOT EXISTS public.white_label_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  setup_fee numeric NOT NULL DEFAULT 0,
  monthly_licence numeric NOT NULL DEFAULT 0,
  revenue_share_percent numeric NOT NULL DEFAULT 0,
  included_clients integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'ALL',
  is_public boolean NOT NULL DEFAULT true,
  highlighted boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.white_label_packages TO anon;
GRANT SELECT ON public.white_label_packages TO authenticated;
GRANT ALL ON public.white_label_packages TO service_role;

ALTER TABLE public.white_label_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read public white-label packages"
  ON public.white_label_packages FOR SELECT
  USING (is_public = true);

CREATE POLICY "Admins manage white-label packages"
  ON public.white_label_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE IF NOT EXISTS public.white_label_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  phone text,
  brand_name text NOT NULL,
  desired_domain text,
  package_key text,
  expected_clients integer,
  message text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.white_label_partners TO authenticated;
GRANT ALL ON public.white_label_partners TO service_role;

ALTER TABLE public.white_label_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own white-label application"
  ON public.white_label_partners FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users create their own white-label application"
  ON public.white_label_partners FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins update white-label applications"
  ON public.white_label_partners FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins delete white-label applications"
  ON public.white_label_partners FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_white_label_packages_updated_at
  BEFORE UPDATE ON public.white_label_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_white_label_partners_updated_at
  BEFORE UPDATE ON public.white_label_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.white_label_packages
  (package_key, name, description, setup_fee, monthly_licence, revenue_share_percent, included_clients, sort_order, highlighted, features)
VALUES
  ('launch', 'Launch', 'For freelancers and small studios starting to resell under their own brand.', 150000, 45000, 0, 10, 1, false,
   '["Your logo, colours and brand name","Subdomain on our infrastructure","Up to 10 client workspaces","Email + chat support","Platform updates included"]'::jsonb),
  ('growth', 'Growth', 'For agencies with an existing client base that need their own domain.', 250000, 90000, 0, 50, 2, true,
   '["Full branding + your own domain","Up to 50 client workspaces","Onboarding & team training","Priority support (24h SLA)","Security updates and bug fixes included","Branded client reports"]'::jsonb),
  ('agency', 'Agency', 'For established agencies that want unlimited scale and a revenue-share option.', 400000, 160000, 15, -1, 3, false,
   '["Everything in Growth","Unlimited client workspaces","Dedicated account manager","Custom integrations & API access","Revenue-share option instead of a fixed licence","Quarterly strategy review"]'::jsonb)
ON CONFLICT (package_key) DO NOTHING;