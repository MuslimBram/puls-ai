\set ON_ERROR_STOP on

-- Extends the minimal #218 disposable baseline with current scan/job contracts
-- required by the final integration-closure migration.
ALTER TABLE public.scan_sources
  ALTER COLUMN id SET DEFAULT pg_catalog.gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS url_or_identifier text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.scan_sources
SET url_or_identifier = CASE
  WHEN business_id='aaaaaaaa-0000-4000-8000-000000000001' THEN 'https://a.example.com'
  WHEN business_id='bbbbbbbb-0000-4000-8000-000000000002' THEN 'https://b.example.com'
  ELSE coalesce(url_or_identifier,'https://fixture.example.com')
END
WHERE url_or_identifier IS NULL;

ALTER TABLE public.scan_sources ALTER COLUMN url_or_identifier SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_sources_business_url_unique
  ON public.scan_sources(business_id,url_or_identifier);

ALTER TABLE public.source_scans
  ALTER COLUMN id SET DEFAULT pg_catalog.gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS scan_phase text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS items_found integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insights_found integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_scanned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE TABLE IF NOT EXISTS public.job_queue (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  job_type text NOT NULL,
  job_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
