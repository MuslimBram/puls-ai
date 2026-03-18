ALTER TABLE public.pricing_settings
ADD COLUMN IF NOT EXISTS plan_name text,
ADD COLUMN IF NOT EXISTS plan_label text,
ADD COLUMN IF NOT EXISTS plan_description text,
ADD COLUMN IF NOT EXISTS cta_label text,
ADD COLUMN IF NOT EXISTS badge_label text,
ADD COLUMN IF NOT EXISTS sort_order integer,
ADD COLUMN IF NOT EXISTS highlight_plan boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS stripe_price_id text,
ADD COLUMN IF NOT EXISTS stripe_product_id text,
ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'month';

CREATE TABLE IF NOT EXISTS public.pricing_feature_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  default_expanded boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_feature_sections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_feature_sections'
      AND policyname = 'Public can view active pricing feature sections'
  ) THEN
    CREATE POLICY "Public can view active pricing feature sections"
    ON public.pricing_feature_sections
    FOR SELECT
    TO authenticated
    USING (is_active = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_feature_sections'
      AND policyname = 'Admins can manage pricing feature sections'
  ) THEN
    CREATE POLICY "Admins can manage pricing feature sections"
    ON public.pricing_feature_sections
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pricing_feature_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.pricing_feature_sections(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  feature_name text NOT NULL,
  feature_tooltip text,
  sort_order integer NOT NULL DEFAULT 0,
  is_highlight boolean NOT NULL DEFAULT false,
  standard_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  professional_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  advanced_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  enterprise_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(section_id, feature_key)
);

ALTER TABLE public.pricing_feature_rows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_feature_rows'
      AND policyname = 'Public can view pricing feature rows'
  ) THEN
    CREATE POLICY "Public can view pricing feature rows"
    ON public.pricing_feature_rows
    FOR SELECT
    TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.pricing_feature_sections s
      WHERE s.id = pricing_feature_rows.section_id
        AND s.is_active = true
    ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'pricing_feature_rows'
      AND policyname = 'Admins can manage pricing feature rows'
  ) THEN
    CREATE POLICY "Admins can manage pricing feature rows"
    ON public.pricing_feature_rows
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.enterprise_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  name text,
  email text NOT NULL,
  company_name text,
  phone text,
  team_size text,
  message text,
  status text NOT NULL DEFAULT 'new',
  source text NOT NULL DEFAULT 'pricing_page',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enterprise_leads'
      AND policyname = 'Users can create enterprise leads'
  ) THEN
    CREATE POLICY "Users can create enterprise leads"
    ON public.enterprise_leads
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enterprise_leads'
      AND policyname = 'Users can view their own enterprise leads'
  ) THEN
    CREATE POLICY "Users can view their own enterprise leads"
    ON public.enterprise_leads
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'enterprise_leads'
      AND policyname = 'Admins can manage enterprise leads'
  ) THEN
    CREATE POLICY "Admins can manage enterprise leads"
    ON public.enterprise_leads
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pricing_feature_sections_sort_order ON public.pricing_feature_sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_pricing_feature_rows_section_sort ON public.pricing_feature_rows(section_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pricing_settings_sort_order ON public.pricing_settings(sort_order);
CREATE INDEX IF NOT EXISTS idx_enterprise_leads_status_created_at ON public.enterprise_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_leads_user_id ON public.enterprise_leads(user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_pricing_feature_sections_updated_at'
  ) THEN
    CREATE TRIGGER update_pricing_feature_sections_updated_at
    BEFORE UPDATE ON public.pricing_feature_sections
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_pricing_feature_rows_updated_at'
  ) THEN
    CREATE TRIGGER update_pricing_feature_rows_updated_at
    BEFORE UPDATE ON public.pricing_feature_rows
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_enterprise_leads_updated_at'
  ) THEN
    CREATE TRIGGER update_enterprise_leads_updated_at
    BEFORE UPDATE ON public.enterprise_leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;