CREATE TABLE IF NOT EXISTS public.public_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  business_name text,
  message text,
  interested_plan text,
  team_size text,
  ai_score numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (ai_score >= 0 AND ai_score <= 1),
  ai_intent text NOT NULL DEFAULT 'warm' CHECK (ai_intent IN ('cold', 'warm', 'hot')),
  ai_notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'website',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  page_url text,
  ip_address text,
  target_workspace_id uuid,
  notes text,
  followed_up_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_leads_email ON public.public_leads (email);
CREATE INDEX IF NOT EXISTS idx_public_leads_status_created ON public.public_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_leads_new_score ON public.public_leads (ai_score DESC) WHERE status = 'new';
ALTER TABLE public.public_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_leads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_leads TO authenticated;
GRANT ALL ON TABLE public.public_leads TO service_role;
DROP POLICY IF EXISTS admins_see_public_leads ON public.public_leads;
CREATE POLICY admins_see_public_leads ON public.public_leads FOR SELECT TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.user_roles ur
 WHERE ur.user_id = (SELECT auth.uid())
 AND ur.role IN ('admin', 'super_admin')
));
CREATE OR REPLACE FUNCTION public.set_public_leads_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
REVOKE ALL ON FUNCTION public.set_public_leads_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_public_leads_updated_at() TO service_role;
DROP TRIGGER IF EXISTS trg_public_leads_updated ON public.public_leads;
CREATE TRIGGER trg_public_leads_updated BEFORE UPDATE ON public.public_leads
FOR EACH ROW EXECUTE FUNCTION public.set_public_leads_updated_at();;
