#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829192000_r3_keywords_oauth_workspace_backfill.sql"
TEST_DB="r3_ws_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
SQL

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
DB_NAME="$TEST_DB"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.workspaces(id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.workspace_members(workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL,PRIMARY KEY(workspace_id,user_id));
CREATE TABLE public.workspace_access_assignments(
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  access_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz
);
CREATE FUNCTION public.has_workspace_access(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=auth.uid())
    OR EXISTS(SELECT 1 FROM public.workspace_access_assignments waa WHERE waa.workspace_id=_workspace AND waa.user_id=auth.uid() AND waa.is_active AND (waa.expires_at IS NULL OR waa.expires_at>now()))
  )
$$;
CREATE FUNCTION public.has_workspace_role(_workspace_id uuid,_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=auth.uid() AND 'owner'=ANY(_roles))
    OR EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace_id AND wm.user_id=auth.uid() AND wm.role=ANY(_roles))
    OR EXISTS(
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id=_workspace_id AND waa.user_id=auth.uid() AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at>now())
        AND (CASE waa.access_role
          WHEN 'business_admin' THEN 'admin'
          WHEN 'manager' THEN 'member'
          WHEN 'employee' THEN 'member'
          WHEN 'freelancer' THEN 'member'
        END)=ANY(_roles)
    )
  )
$$;

CREATE TABLE public.keywords(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  keyword text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  UNIQUE(user_id,keyword)
);
CREATE TABLE public.oauth_states(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  channel_type text NOT NULL DEFAULT 'instagram',
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE
);
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can delete own keywords" ON public.keywords FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own keywords" ON public.keywords FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can update own keywords" ON public.keywords FOR UPDATE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can view own keywords" ON public.keywords FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Service role full access on oauth_states" ON public.oauth_states FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE POLICY "Users can delete own oauth states" ON public.oauth_states FOR DELETE TO authenticated USING(auth.uid()=user_id);
CREATE POLICY "Users can insert own oauth states" ON public.oauth_states FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Users can read own oauth states" ON public.oauth_states FOR SELECT TO authenticated USING(auth.uid()=user_id);
GRANT ALL PRIVILEGES ON public.keywords,public.oauth_states TO anon,authenticated,service_role;

INSERT INTO public.workspaces(id,owner_id) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
-- Duplicate assignment to the same workspace must not make attribution ambiguous.
INSERT INTO public.workspace_access_assignments(workspace_id,user_id,access_role,is_active,expires_at) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','manager',true,now()+interval '1 day');
INSERT INTO public.keywords(id,user_id,keyword,workspace_id) VALUES
 ('31111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','alpha',NULL),
 ('32222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','beta','22222222-2222-4222-8222-222222222222');
INSERT INTO public.oauth_states(id,state,user_id,channel_type,redirect_uri,expires_at,workspace_id) VALUES
 ('41111111-1111-4111-8111-111111111111','state-a','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','facebook','https://example.test/callback',now()-interval '1 day',NULL);
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF (SELECT workspace_id FROM public.keywords WHERE id='31111111-1111-4111-8111-111111111111') <> '11111111-1111-4111-8111-111111111111'::uuid THEN
    RAISE EXCEPTION 'keyword deterministic backfill failed';
  END IF;
  IF (SELECT workspace_id FROM public.oauth_states WHERE id='41111111-1111-4111-8111-111111111111') <> '11111111-1111-4111-8111-111111111111'::uuid THEN
    RAISE EXCEPTION 'oauth state deterministic backfill failed';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name IN('keywords','oauth_states') AND column_name='workspace_id' AND is_nullable<>'NO') THEN
    RAISE EXCEPTION 'workspace_id remains nullable';
  END IF;
  IF has_table_privilege('anon','public.keywords','SELECT') OR has_table_privilege('anon','public.oauth_states','SELECT') THEN
    RAISE EXCEPTION 'anon retains read access';
  END IF;
  IF has_table_privilege('authenticated','public.oauth_states','SELECT') OR has_table_privilege('authenticated','public.oauth_states','INSERT') THEN
    RAISE EXCEPTION 'authenticated retains oauth_states access';
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT * FROM public.keywords WHERE workspace_id='11111111-1111-4111-8111-111111111111';
INSERT INTO public.keywords(user_id,keyword,workspace_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','gamma','11111111-1111-4111-8111-111111111111');
UPDATE public.keywords SET is_active=false WHERE keyword='gamma' AND workspace_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  BEGIN
    DELETE FROM public.keywords WHERE keyword='gamma' AND workspace_id='11111111-1111-4111-8111-111111111111';
    RAISE EXCEPTION 'expected member delete denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.keywords(user_id,keyword,workspace_id) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','forbidden','22222222-2222-4222-8222-222222222222');
    RAISE EXCEPTION 'expected foreign workspace keyword denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET ROLE service_role;
INSERT INTO public.oauth_states(state,user_id,channel_type,redirect_uri,expires_at,workspace_id)
VALUES('state-service','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','facebook','https://example.test/callback',now()+interval '5 min','11111111-1111-4111-8111-111111111111');
DELETE FROM public.oauth_states WHERE state='state-service';
RESET ROLE;
SQL

echo "R3 keywords/oauth workspace verifier: PASS"
