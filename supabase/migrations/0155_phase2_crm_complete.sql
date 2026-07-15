-- supabase/migrations/0155_phase2_crm_complete.sql
-- FAZA 2 — CRM i plotë (82% → 100%)

-- 1. PIPELINE STAGES
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  name          text NOT NULL,
  order_index   integer NOT NULL DEFAULT 0,
  color         text NOT NULL DEFAULT '#6b7280',
  is_won        boolean NOT NULL DEFAULT false,
  is_lost       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.pipeline_stages (workspace_id, name, order_index, color)
  VALUES
    (p_workspace_id, 'Lead i Ri',        0, '#6b7280'),
    (p_workspace_id, 'Kontaktuar',       1, '#3b82f6'),
    (p_workspace_id, 'Interesuar',       2, '#8b5cf6'),
    (p_workspace_id, 'Propozim Derguar', 3, '#f59e0b'),
    (p_workspace_id, 'Negocim',          4, '#f97316'),
    (p_workspace_id, 'Fituar',           5, '#22c55e'),
    (p_workspace_id, 'Humbur',           6, '#ef4444')
  ON CONFLICT DO NOTHING;
  UPDATE public.pipeline_stages SET is_won=true  WHERE workspace_id=p_workspace_id AND name='Fituar';
  UPDATE public.pipeline_stages SET is_lost=true WHERE workspace_id=p_workspace_id AND name='Humbur';
END;
$$;

-- 2. ZGJERIMI I deals
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS probability   integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS expected_close_date date,
  ADD COLUMN IF NOT EXISTS source        text DEFAULT 'manual';

-- 3. CONTACT TAGS
CREATE TABLE IF NOT EXISTS public.contact_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6b7280',
  UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.customer_tags (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.contact_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, tag_id)
);

-- 4. IMPORT JOBS
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  started_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type            text NOT NULL DEFAULT 'contacts_csv',
  status          text NOT NULL DEFAULT 'processing',
  total_rows      integer NOT NULL DEFAULT 0,
  imported_rows   integer NOT NULL DEFAULT 0,
  skipped_rows    integer NOT NULL DEFAULT 0,
  duplicate_rows  integer NOT NULL DEFAULT 0,
  error_rows      integer NOT NULL DEFAULT 0,
  errors          jsonb NOT NULL DEFAULT '[]',
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- 5. DUPLICATE DETECTION FUNCTION
CREATE OR REPLACE FUNCTION public.find_duplicate_contacts(p_workspace_id uuid)
RETURNS TABLE (group_key text, contact_ids uuid[], emails text[], phones text[], match_type text)
LANGUAGE sql STABLE AS $$
  SELECT LOWER(TRIM(c.email)) AS group_key,
    ARRAY_AGG(c.id), ARRAY_AGG(c.email), ARRAY_AGG(c.phone), 'email'
  FROM public.customers c
  WHERE c.business_id = p_workspace_id AND c.email IS NOT NULL AND c.email != ''
  GROUP BY LOWER(TRIM(c.email)) HAVING COUNT(*) > 1;
$$;

-- 6. RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_pipeline" ON public.pipeline_stages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = pipeline_stages.workspace_id AND wm.user_id = auth.uid()
  ));

CREATE POLICY "workspace_import_jobs" ON public.import_jobs
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = import_jobs.workspace_id AND wm.user_id = auth.uid()
  ));
