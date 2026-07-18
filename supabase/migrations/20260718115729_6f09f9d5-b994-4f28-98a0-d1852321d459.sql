CREATE TABLE IF NOT EXISTS public.meta_ads_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  reach bigint DEFAULT 0,
  cpc numeric(8,4) DEFAULT 0,
  cpm numeric(8,4) DEFAULT 0,
  ctr numeric(8,4) DEFAULT 0,
  leads_count integer DEFAULT 0,
  cost_per_lead numeric(10,2) DEFAULT 0,
  raw_data jsonb DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, ad_account_id, date_start, date_stop)
);
GRANT SELECT ON public.meta_ads_cache TO authenticated;
GRANT ALL ON public.meta_ads_cache TO service_role;
ALTER TABLE public.meta_ads_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_ads_cache_select_own" ON public.meta_ads_cache;
CREATE POLICY "meta_ads_cache_select_own"
  ON public.meta_ads_cache FOR SELECT TO authenticated
  USING (workspace_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.google_ads_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  customer_id text NOT NULL,
  date_start date NOT NULL,
  date_stop date NOT NULL,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  spend numeric(12,2) DEFAULT 0,
  conversions numeric(10,2) DEFAULT 0,
  cpc numeric(8,4) DEFAULT 0,
  ctr numeric(8,4) DEFAULT 0,
  cost_per_conv numeric(10,2) DEFAULT 0,
  raw_data jsonb DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, customer_id, date_start, date_stop)
);
GRANT SELECT ON public.google_ads_cache TO authenticated;
GRANT ALL ON public.google_ads_cache TO service_role;
ALTER TABLE public.google_ads_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "google_ads_cache_select_own" ON public.google_ads_cache;
CREATE POLICY "google_ads_cache_select_own"
  ON public.google_ads_cache FOR SELECT TO authenticated
  USING (workspace_id = auth.uid());