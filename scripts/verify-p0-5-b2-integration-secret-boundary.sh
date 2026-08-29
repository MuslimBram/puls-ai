#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829113000_p0_5_b2_integration_secret_boundary.sql"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN CREATE ROLE sandbox_exec NOLOGIN; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Verifier Workspace'
);

CREATE TABLE IF NOT EXISTS public.business_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id)
);

CREATE TABLE IF NOT EXISTS public.external_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  integration_key text NOT NULL,
  integration_name text NOT NULL,
  category text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'planned',
  is_enabled boolean NOT NULL DEFAULT false,
  credentials jsonb,
  config jsonb,
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  rate_limit_per_hour integer NOT NULL DEFAULT 2,
  min_scan_interval_minutes integer NOT NULL DEFAULT 30,
  last_scan_at timestamptz,
  keyword_match_threshold numeric NOT NULL DEFAULT 0.6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.unified_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.business_profiles(id) ON DELETE SET NULL,
  provider text NOT NULL,
  category text NOT NULL,
  connection_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  display_name text,
  last_tested_at timestamptz,
  last_error text,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_integrations DROP CONSTRAINT IF EXISTS external_integrations_workspace_id_integration_key_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.external_integrations'::regclass
      AND conname = 'external_integrations_user_id_integration_key_key'
  ) THEN
    ALTER TABLE public.external_integrations
      ADD CONSTRAINT external_integrations_user_id_integration_key_key UNIQUE (user_id, integration_key);
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can view all external_integrations" ON public.external_integrations;
DROP POLICY IF EXISTS "Users can delete own external_integrations" ON public.external_integrations;
DROP POLICY IF EXISTS "Users can insert own external_integrations" ON public.external_integrations;
DROP POLICY IF EXISTS "Users can update own external_integrations" ON public.external_integrations;
DROP POLICY IF EXISTS "Users can view own external_integrations" ON public.external_integrations;
CREATE POLICY "Admins can view all external_integrations" ON public.external_integrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can delete own external_integrations" ON public.external_integrations FOR DELETE TO authenticated USING (true);
CREATE POLICY "Users can insert own external_integrations" ON public.external_integrations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update own external_integrations" ON public.external_integrations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can view own external_integrations" ON public.external_integrations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins view all connections" ON public.unified_connections;
DROP POLICY IF EXISTS "Users manage own connections" ON public.unified_connections;
CREATE POLICY "Admins view all connections" ON public.unified_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users manage own connections" ON public.unified_connections FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL PRIVILEGES ON TABLE public.external_integrations TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.external_integrations TO sandbox_exec;
GRANT ALL PRIVILEGES ON TABLE public.unified_connections TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.unified_connections TO sandbox_exec;

DELETE FROM public.unified_connections WHERE id = '44444444-4444-4444-8444-444444444444';
DELETE FROM public.business_profiles WHERE id = '33333333-3333-4333-8333-333333333333';
DELETE FROM public.workspaces WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

-- Build the negative fixture in separate statements. This avoids data-modifying
-- CTE snapshot/order semantics from making the verifier depend on execution order.
INSERT INTO public.workspaces (id, owner_id, name)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '__p0_5_b2_ws_a__'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '__p0_5_b2_ws_b__')
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  name = EXCLUDED.name;

INSERT INTO public.business_profiles (id, workspace_id)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222'
)
ON CONFLICT (id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id;

INSERT INTO public.unified_connections (
  id, user_id, workspace_id, business_id, provider, category, connection_type
) VALUES (
  '44444444-4444-4444-8444-444444444444',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '__p0_5_b2_cross_tenant__',
  'verifier',
  'oauth'
)
ON CONFLICT (id) DO UPDATE SET
  workspace_id = EXCLUDED.workspace_id,
  business_id = EXCLUDED.business_id,
  provider = EXCLUDED.provider;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.unified_connections uc
    JOIN public.business_profiles bp ON bp.id = uc.business_id
    WHERE uc.id = '44444444-4444-4444-8444-444444444444'
      AND bp.workspace_id <> uc.workspace_id
  ) THEN
    RAISE EXCEPTION 'verifier setup did not create the intended cross-workspace business reference';
  END IF;
END $$;
SQL

# The migration must fail closed while a connection points to a business in another workspace.
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/tmp/p0_5_b2_guard.log 2>&1; then
  echo "ERROR: migration accepted a cross-workspace business link"
  cat /tmp/p0_5_b2_guard.log
  exit 1
fi
if ! grep -q "cross-workspace business link exists" /tmp/p0_5_b2_guard.log; then
  echo "ERROR: migration failed for an unexpected reason"
  cat /tmp/p0_5_b2_guard.log
  exit 1
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.unified_connections WHERE id = '44444444-4444-4444-8444-444444444444';
DELETE FROM public.business_profiles WHERE id = '33333333-3333-4333-8333-333333333333';
DELETE FROM public.workspaces WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  tbl text;
  blocked_role text;
  blocked_priv text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['external_integrations','unified_connections'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
        AND column_name = 'workspace_id' AND is_nullable <> 'NO'
    ) THEN
      RAISE EXCEPTION '%.workspace_id is still nullable', tbl;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      RAISE EXCEPTION 'browser RLS policies remain on backend-only table %', tbl;
    END IF;

    FOREACH blocked_role IN ARRAY ARRAY['anon','authenticated','sandbox_exec'] LOOP
      FOREACH blocked_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(blocked_role, format('public.%I', tbl), blocked_priv) THEN
          RAISE EXCEPTION '% still has % on %', blocked_role, blocked_priv, tbl;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH blocked_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('service_role', format('public.%I', tbl), blocked_priv) THEN
        RAISE EXCEPTION 'service_role missing required % on %', blocked_priv, tbl;
      END IF;
    END LOOP;

    FOREACH blocked_priv IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('service_role', format('public.%I', tbl), blocked_priv) THEN
        RAISE EXCEPTION 'service_role retains unnecessary % on %', blocked_priv, tbl;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.external_integrations'::regclass
      AND conname = 'external_integrations_user_id_integration_key_key'
  ) THEN
    RAISE EXCEPTION 'legacy user-scoped integration uniqueness constraint remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.external_integrations'::regclass
      AND conname = 'external_integrations_workspace_id_integration_key_key'
  ) THEN
    RAISE EXCEPTION 'workspace-scoped integration uniqueness constraint is missing';
  END IF;
END $$;

-- Prove the same user can configure the same integration key independently in two workspaces.
INSERT INTO public.workspaces (id, owner_id, name)
VALUES
  ('55555555-5555-4555-8555-555555555555', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '__p0_5_b2_unique_a__'),
  ('66666666-6666-4666-8666-666666666666', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '__p0_5_b2_unique_b__')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.external_integrations (
  id, user_id, workspace_id, integration_key, integration_name, category
) VALUES
  ('77777777-7777-4777-8777-777777777777', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', '__same_key__', 'Verifier', 'verifier'),
  ('88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '66666666-6666-4666-8666-666666666666', '__same_key__', 'Verifier', 'verifier')
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.external_integrations WHERE id IN (
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
);
DELETE FROM public.workspaces WHERE id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666'
);
SQL

echo "P0.5-B2 integration secret boundary: PASS"
