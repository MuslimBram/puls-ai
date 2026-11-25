-- ============================================================
-- BUSINESS INTELLIGENCE FOUNDATION
-- Phase 1: normalized, tenant-scoped business knowledge foundation
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.business_knowledge_item_type AS ENUM (
  'business_identity',
  'product',
  'service',
  'page',
  'post',
  'faq',
  'media',
  'contact',
  'link',
  'review',
  'comment',
  'business_fact',
  'other'
);

CREATE TABLE public.business_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('website','social','channel','manual','import','other')),
  provider text,
  canonical_url text,
  external_id text,
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, business_id, source_type, provider, external_id)
);

CREATE TABLE public.business_knowledge_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.business_knowledge_sources(id) ON DELETE SET NULL,
  scan_history_id uuid REFERENCES public.business_scan_history(id) ON DELETE SET NULL,
  item_type public.business_knowledge_item_type NOT NULL,
  external_id text NOT NULL,
  canonical_url text,
  title text,
  summary text,
  content_text text,
  structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  confidence numeric(4,3) NOT NULL DEFAULT 0.800 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, business_id, item_type, external_id)
);

CREATE TABLE public.business_knowledge_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.business_knowledge_sources(id) ON DELETE SET NULL,
  scan_history_id uuid REFERENCES public.business_scan_history(id) ON DELETE SET NULL,
  snapshot_kind text NOT NULL CHECK (snapshot_kind IN ('website_scan','source_scan','business_profile','knowledge_refresh','other')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bki_workspace_business_type
  ON public.business_knowledge_items(workspace_id, business_id, item_type);
CREATE INDEX idx_bki_source ON public.business_knowledge_items(source_id);
CREATE INDEX idx_bki_scan_history ON public.business_knowledge_items(scan_history_id);
CREATE INDEX idx_bki_current ON public.business_knowledge_items(workspace_id, business_id, is_current);
CREATE INDEX idx_bks_workspace_business_time
  ON public.business_knowledge_snapshots(workspace_id, business_id, captured_at DESC);
CREATE INDEX idx_bks_scan_history ON public.business_knowledge_snapshots(scan_history_id);
CREATE INDEX idx_bks_source ON public.business_knowledge_snapshots(source_id);

-- Enforce the tenant parent relationships. The client cannot pair a business,
-- source or scan from different workspaces merely by supplying matching UUIDs.
CREATE OR REPLACE FUNCTION public.enforce_business_knowledge_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_workspace uuid;
  scan_workspace uuid;
  source_workspace uuid;
BEGIN
  SELECT bp.workspace_id INTO business_workspace
  FROM public.business_profiles bp
  WHERE bp.id = NEW.business_id;

  IF business_workspace IS NULL OR business_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'business_knowledge workspace/business mismatch';
  END IF;

  IF NEW.scan_history_id IS NOT NULL THEN
    SELECT sh.workspace_id INTO scan_workspace
    FROM public.business_scan_history sh
    WHERE sh.id = NEW.scan_history_id;
    IF scan_workspace IS NULL OR scan_workspace <> NEW.workspace_id THEN
      RAISE EXCEPTION 'business_knowledge workspace/scan mismatch';
    END IF;
  END IF;

  IF NEW.source_id IS NOT NULL THEN
    SELECT s.workspace_id INTO source_workspace
    FROM public.business_knowledge_sources s
    WHERE s.id = NEW.source_id;
    IF source_workspace IS NULL OR source_workspace <> NEW.workspace_id THEN
      RAISE EXCEPTION 'business_knowledge workspace/source mismatch';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_business_knowledge_source_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  business_workspace uuid;
BEGIN
  SELECT bp.workspace_id INTO business_workspace
  FROM public.business_profiles bp
  WHERE bp.id = NEW.business_id;
  IF business_workspace IS NULL OR business_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'business_knowledge_source workspace/business mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_business_knowledge_source_workspace
BEFORE INSERT OR UPDATE ON public.business_knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_knowledge_source_workspace();

CREATE TRIGGER trg_business_knowledge_item_workspace
BEFORE INSERT OR UPDATE ON public.business_knowledge_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_knowledge_workspace();

CREATE TRIGGER trg_business_knowledge_snapshot_workspace
BEFORE INSERT ON public.business_knowledge_snapshots
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_knowledge_workspace();

ALTER TABLE public.business_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_knowledge_snapshots FORCE ROW LEVEL SECURITY;

CREATE POLICY business_knowledge_sources_select
ON public.business_knowledge_sources FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_sources_insert
ON public.business_knowledge_sources FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_sources_update
ON public.business_knowledge_sources FOR UPDATE TO authenticated
USING (public.has_workspace_access(workspace_id))
WITH CHECK (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_sources_delete
ON public.business_knowledge_sources FOR DELETE TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY business_knowledge_items_select
ON public.business_knowledge_items FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_items_insert
ON public.business_knowledge_items FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_items_update
ON public.business_knowledge_items FOR UPDATE TO authenticated
USING (public.has_workspace_access(workspace_id))
WITH CHECK (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_items_delete
ON public.business_knowledge_items FOR DELETE TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY business_knowledge_snapshots_select
ON public.business_knowledge_snapshots FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY business_knowledge_snapshots_insert
ON public.business_knowledge_snapshots FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_access(workspace_id));

REVOKE ALL ON FUNCTION public.enforce_business_knowledge_workspace() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_business_knowledge_source_workspace() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.business_knowledge_sources IS 'Canonical external/internal sources contributing to a business knowledge profile.';
COMMENT ON TABLE public.business_knowledge_items IS 'Normalized current business knowledge items extracted from website, channels, scans, imports, or manual sources.';
COMMENT ON TABLE public.business_knowledge_snapshots IS 'Immutable historical snapshots used to understand business evolution over time.';
;
