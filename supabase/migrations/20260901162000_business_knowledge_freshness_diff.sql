-- ============================================================
-- BUSINESS KNOWLEDGE FRESHNESS / DIFF / PAGE PROVENANCE
-- ============================================================

CREATE TABLE public.business_scan_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  scan_history_id uuid NOT NULL REFERENCES public.business_scan_history(id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  title text,
  crawl_index integer NOT NULL DEFAULT 0 CHECK (crawl_index >= 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_markdown text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  security_category text NOT NULL DEFAULT 'unknown',
  security_risk_score integer NOT NULL DEFAULT 100 CHECK (security_risk_score BETWEEN 0 AND 100),
  security_action text NOT NULL DEFAULT 'quarantine'
    CHECK (security_action IN ('allow','tag','quarantine','reject')),
  security_reason_code text NOT NULL DEFAULT 'UNCLASSIFIED',
  is_knowledge_eligible boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_history_id, canonical_url),
  CHECK (is_knowledge_eligible = false OR security_action IN ('allow','tag')),
  CHECK (is_knowledge_eligible = true OR content_markdown IS NULL)
);

CREATE INDEX idx_business_scan_pages_tenant_scan
  ON public.business_scan_pages(workspace_id, business_id, scan_history_id, crawl_index);
CREATE INDEX idx_business_scan_pages_url
  ON public.business_scan_pages(workspace_id, business_id, canonical_url);
CREATE INDEX idx_business_scan_pages_security
  ON public.business_scan_pages(workspace_id, security_action, security_risk_score DESC);

CREATE OR REPLACE FUNCTION public.enforce_business_scan_page_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_profiles bp
    WHERE bp.id = NEW.business_id
      AND bp.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'business_scan_pages workspace/business mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_scan_history sh
    WHERE sh.id = NEW.scan_history_id
      AND sh.workspace_id = NEW.workspace_id
      AND sh.business_id = NEW.business_id
  ) THEN
    RAISE EXCEPTION 'business_scan_pages workspace/scan mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_scan_page_workspace
BEFORE INSERT OR UPDATE ON public.business_scan_pages
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_scan_page_workspace();

ALTER TABLE public.business_scan_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_scan_pages FORCE ROW LEVEL SECURITY;

CREATE POLICY business_scan_pages_select
ON public.business_scan_pages FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

-- Page writes are server-side only. Browser roles can inspect provenance but
-- cannot forge crawler/security evidence.
REVOKE INSERT, UPDATE, DELETE ON public.business_scan_pages FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_business_scan_page_workspace()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.business_knowledge_items
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS source_trust_score numeric(4,3) NOT NULL DEFAULT 0.800
    CHECK (source_trust_score >= 0 AND source_trust_score <= 1),
  ADD COLUMN IF NOT EXISTS valid_from timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS valid_to timestamptz;

CREATE TABLE public.business_knowledge_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.business_knowledge_sources(id) ON DELETE SET NULL,
  item_id uuid REFERENCES public.business_knowledge_items(id) ON DELETE SET NULL,
  scan_history_id uuid REFERENCES public.business_scan_history(id) ON DELETE SET NULL,
  item_type public.business_knowledge_item_type NOT NULL,
  change_type text NOT NULL CHECK (change_type IN ('added','updated','removed')),
  previous_hash text,
  current_hash text,
  previous_data jsonb,
  current_data jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_knowledge_changes_tenant_time
  ON public.business_knowledge_changes(workspace_id, business_id, detected_at DESC);
CREATE INDEX idx_business_knowledge_changes_item
  ON public.business_knowledge_changes(item_id, detected_at DESC);
CREATE INDEX idx_business_knowledge_changes_scan
  ON public.business_knowledge_changes(scan_history_id);

ALTER TABLE public.business_knowledge_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_changes FORCE ROW LEVEL SECURITY;

CREATE POLICY business_knowledge_changes_select
ON public.business_knowledge_changes FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

REVOKE INSERT, UPDATE, DELETE ON public.business_knowledge_changes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_business_knowledge_item_freshness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash_input text;
BEGIN
  v_hash_input := concat_ws('|',
    NEW.item_type::text,
    COALESCE(NEW.external_id, ''),
    COALESCE(NEW.canonical_url, ''),
    COALESCE(NEW.title, ''),
    COALESCE(NEW.summary, ''),
    COALESCE(NEW.content_text, ''),
    COALESCE(NEW.structured_data::text, '{}'),
    COALESCE(NEW.source_published_at::text, ''),
    COALESCE(NEW.confidence::text, ''),
    COALESCE(NEW.source_trust_score::text, '')
  );

  NEW.content_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_hash_input, 'UTF8'), 'sha256'),
    'hex'
  );

  IF TG_OP = 'INSERT' THEN
    NEW.valid_from := COALESCE(NEW.valid_from, now());
    NEW.valid_to := CASE WHEN NEW.is_current THEN NULL ELSE COALESCE(NEW.valid_to, now()) END;
  ELSE
    IF OLD.content_hash IS DISTINCT FROM NEW.content_hash OR OLD.is_current IS DISTINCT FROM NEW.is_current THEN
      NEW.valid_from := CASE WHEN NEW.is_current THEN now() ELSE OLD.valid_from END;
    END IF;

    IF OLD.is_current = true AND NEW.is_current = false THEN
      NEW.valid_to := COALESCE(NEW.valid_to, now());
    ELSIF OLD.is_current = false AND NEW.is_current = true THEN
      NEW.valid_to := NULL;
      NEW.valid_from := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prepare_business_knowledge_item_freshness
BEFORE INSERT OR UPDATE ON public.business_knowledge_items
FOR EACH ROW EXECUTE FUNCTION public.prepare_business_knowledge_item_freshness();

-- Backfill existing rows in this branch after the trigger exists.
UPDATE public.business_knowledge_items
SET updated_at = updated_at;

ALTER TABLE public.business_knowledge_items
  ALTER COLUMN content_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION public.log_business_knowledge_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_change text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_change := 'added';
  ELSIF OLD.is_current = true AND NEW.is_current = false THEN
    v_change := 'removed';
  ELSIF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
    v_change := 'updated';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.business_knowledge_changes (
    workspace_id, business_id, source_id, item_id, scan_history_id,
    item_type, change_type, previous_hash, current_hash,
    previous_data, current_data, detected_at
  ) VALUES (
    NEW.workspace_id,
    NEW.business_id,
    NEW.source_id,
    NEW.id,
    NEW.scan_history_id,
    NEW.item_type,
    v_change,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.content_hash END,
    NEW.content_hash,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'canonical_url', OLD.canonical_url,
      'title', OLD.title,
      'summary', OLD.summary,
      'content_text', OLD.content_text,
      'structured_data', OLD.structured_data,
      'confidence', OLD.confidence,
      'source_trust_score', OLD.source_trust_score,
      'is_current', OLD.is_current,
      'valid_from', OLD.valid_from,
      'valid_to', OLD.valid_to
    ) END,
    jsonb_build_object(
      'canonical_url', NEW.canonical_url,
      'title', NEW.title,
      'summary', NEW.summary,
      'content_text', NEW.content_text,
      'structured_data', NEW.structured_data,
      'confidence', NEW.confidence,
      'source_trust_score', NEW.source_trust_score,
      'is_current', NEW.is_current,
      'valid_from', NEW.valid_from,
      'valid_to', NEW.valid_to
    ),
    now()
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_business_knowledge_item_change
AFTER INSERT OR UPDATE ON public.business_knowledge_items
FOR EACH ROW EXECUTE FUNCTION public.log_business_knowledge_item_change();

REVOKE ALL ON FUNCTION public.prepare_business_knowledge_item_freshness()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_business_knowledge_item_change()
  FROM PUBLIC, anon, authenticated, service_role;

-- The original scan bridge is SECURITY DEFINER and calls pgcrypto.digest.
-- Supabase installs pgcrypto in `extensions`, so pin only trusted schemas and
-- make the existing unqualified digest() resolve correctly.
ALTER FUNCTION public.sync_completed_business_scan_to_knowledge()
  SET search_path TO pg_catalog, extensions;

COMMENT ON TABLE public.business_scan_pages IS
  'Per-page crawl provenance and security verdict. Quarantined/rejected pages never store knowledge-eligible content.';
COMMENT ON TABLE public.business_knowledge_changes IS
  'Append-only change evidence for the evolving current business knowledge profile.';
