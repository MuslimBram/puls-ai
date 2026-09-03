\set ON_ERROR_STOP on

-- Disposable local PostgreSQL baseline for PR #218 runtime certification.
-- This file intentionally models only the current contracts required by the
-- Business Intelligence migrations. It must run in a fresh throw-away DB.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY
);

CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_access(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = (SELECT auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
      AND wm.user_id = (SELECT auth.uid())
      AND wm.role = ANY(_roles)
  )
$$;

CREATE TABLE public.business_profiles (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid,
  business_name text
);

CREATE TABLE public.business_scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  triggered_by uuid NOT NULL,
  scanned_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  scan_phase text DEFAULT 'queued',
  pages_scanned integer DEFAULT 0,
  insights_count integer DEFAULT 0,
  duration_ms integer,
  error_message text,
  summary_json jsonb DEFAULT '{}'::jsonb,
  products_found jsonb DEFAULT '[]'::jsonb,
  services_found jsonb DEFAULT '[]'::jsonb,
  contact_methods jsonb DEFAULT '[]'::jsonb,
  social_links jsonb DEFAULT '{}'::jsonb,
  pricing_signals jsonb DEFAULT '[]'::jsonb,
  tone_of_voice text,
  suggested_keywords jsonb DEFAULT '[]'::jsonb,
  cta_signals jsonb DEFAULT '[]'::jsonb,
  competitor_hints jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.scan_sources (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  business_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  scan_status text DEFAULT 'pending'
);

CREATE TABLE public.source_scans (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES public.scan_sources(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  status text DEFAULT 'pending'
);

-- Legacy Knowledge Base tables exist only so the #218 fail-closed bridge guard
-- can be certified against the current scan_post_process path.
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  business_id uuid,
  source_type text,
  source_name text,
  source_url text,
  status text,
  is_enabled boolean,
  last_scanned_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  workspace_id uuid,
  business_id uuid,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  content text,
  summary text,
  topic_tags text[],
  content_type text,
  page_url text,
  page_title text,
  chunk_index integer,
  word_count integer
);

CREATE OR REPLACE FUNCTION public.enforce_business_scan_history_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') THEN
    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.triggered_by IS DISTINCT FROM OLD.triggered_by THEN
      RAISE EXCEPTION 'business_scan_history tenant and creator identity are immutable';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_business_scan_history_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.business_profiles b
      WHERE b.id = NEW.business_id
        AND b.workspace_id = NEW.workspace_id
    ) THEN
      RAISE EXCEPTION 'business_scan_history business/workspace parent mismatch';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_business_scan_history_identity
BEFORE UPDATE ON public.business_scan_history
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_scan_history_identity();

CREATE TRIGGER trg_business_scan_history_parent
BEFORE INSERT OR UPDATE ON public.business_scan_history
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_scan_history_parent();

ALTER TABLE public.business_scan_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.business_scan_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_scan_history TO service_role;

CREATE POLICY "p1_business_scan_history_select_ws"
ON public.business_scan_history FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "p1_business_scan_history_insert_ws"
ON public.business_scan_history FOR INSERT TO authenticated
WITH CHECK (
  triggered_by = (SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])
);

CREATE POLICY "p1_business_scan_history_update_ws"
ON public.business_scan_history FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']));

-- Fixtures: two isolated workspaces/businesses and exact source lineages.
INSERT INTO public.workspaces(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');

INSERT INTO public.business_profiles(id,workspace_id,user_id,business_name) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Business A'),
  ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Business B');

INSERT INTO public.scan_sources(id,workspace_id,user_id,business_id) VALUES
  ('aaaaaaaa-1000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-1000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','bbbbbbbb-0000-4000-8000-000000000002');

INSERT INTO public.source_scans(id,source_id,user_id,workspace_id,business_id) VALUES
  ('aaaaaaaa-2000-4000-8000-000000000001','aaaaaaaa-1000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-2000-4000-8000-000000000002','bbbbbbbb-1000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-0000-4000-8000-000000000002');
