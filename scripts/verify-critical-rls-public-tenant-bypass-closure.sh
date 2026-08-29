#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829150000_critical_rls_public_tenant_bypass_closure.sql"
TEST_DB="critical_rls_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"

cleanup() {
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$ADMIN_DB" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE sandbox_exec NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
SQL

createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB"
DB_NAME="$TEST_DB"

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('user','admin','super_admin','business_owner');
CREATE TABLE public.workspaces (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.user_roles (user_id uuid NOT NULL, role public.app_role NOT NULL);

CREATE FUNCTION public.has_workspace_access(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=_workspace AND w.owner_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=auth.uid())
  )
$$;
CREATE FUNCTION public.has_workspace_role(_workspace_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id=_workspace_id AND w.owner_id=auth.uid() AND 'owner'=ANY(_roles)
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id=_workspace_id AND wm.user_id=auth.uid() AND wm.role=ANY(_roles)
    )
  )
$$;
REVOKE ALL ON FUNCTION public.has_workspace_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,text[]) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_campaign_segments','business_rules','contact_consent','conversion_events',
    'customer_referral_events','customer_referral_programs','frequency_cap_log',
    'lifecycle_trigger_log','lifecycle_triggers','next_best_actions',
    'processed_webhook_events','voice_ai_sessions'
  ] LOOP
    EXECUTE format('CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid REFERENCES public.workspaces(id), payload text)', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL PRIVILEGES ON public.%I TO anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO sandbox_exec', t);
  END LOOP;
END $$;

-- Recreate the exact dangerous policy names/classes the corrective migration must remove.
CREATE POLICY "service_manage_consent" ON public.contact_consent FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_conversions" ON public.conversion_events FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_ref_events" ON public.customer_referral_events FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_freq_log" ON public.frequency_cap_log FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_trigger_log" ON public.lifecycle_trigger_log FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_nba" ON public.next_best_actions FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_only_webhooks" ON public.processed_webhook_events FOR ALL TO public USING (auth.uid() IS NULL);
CREATE POLICY "service_manage_sessions" ON public.voice_ai_sessions FOR ALL TO public USING (auth.uid() IS NULL);

CREATE POLICY "workspace_manage_segments" ON public.ai_campaign_segments FOR ALL TO public USING (
  workspace_id IN (SELECT ai_campaign_segments.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_manage_ref_programs" ON public.customer_referral_programs FOR ALL TO public USING (
  workspace_id IN (SELECT customer_referral_programs.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_manage_triggers" ON public.lifecycle_triggers FOR ALL TO public USING (
  workspace_id IN (SELECT lifecycle_triggers.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_rules" ON public.business_rules FOR SELECT TO public USING (
  workspace_id IN (SELECT business_rules.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_consent" ON public.contact_consent FOR SELECT TO public USING (
  workspace_id IN (SELECT contact_consent.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_conversions" ON public.conversion_events FOR SELECT TO public USING (
  workspace_id IN (SELECT conversion_events.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_ref_events" ON public.customer_referral_events FOR SELECT TO public USING (
  workspace_id IN (SELECT customer_referral_events.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "workspace_read_nba" ON public.next_best_actions FOR SELECT TO public USING (
  workspace_id IN (SELECT next_best_actions.workspace_id FROM public.user_roles WHERE user_roles.user_id=auth.uid())
  OR workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id=auth.uid())
);
CREATE POLICY "admin_manage_rules" ON public.business_rules FOR ALL TO public USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin','business_owner'))
);
CREATE POLICY "workspace_read_sessions" ON public.voice_ai_sessions FOR SELECT TO public USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role IN ('admin','super_admin'))
);
SQL

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  t text;
  role_name text;
  privilege_name text;
  policy_count integer;
BEGIN
  -- Dangerous policy classes must be completely gone.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename = ANY(ARRAY[
        'ai_campaign_segments','business_rules','contact_consent','conversion_events',
        'customer_referral_events','customer_referral_programs','frequency_cap_log',
        'lifecycle_trigger_log','lifecycle_triggers','next_best_actions',
        'processed_webhook_events','voice_ai_sessions'
      ])
      AND (
        'public'=ANY(roles)
        OR coalesce(qual,'') ~* 'auth\.uid\(\).*is null'
        OR coalesce(with_check,'') ~* 'auth\.uid\(\).*is null'
        OR coalesce(qual,'') ~* 'from user_roles'
        OR coalesce(with_check,'') ~* 'from user_roles'
      )
  ) THEN
    RAISE EXCEPTION 'dangerous public/self-correlated RLS remains';
  END IF;

  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname='public' AND tablename = ANY(ARRAY[
    'ai_campaign_segments','business_rules','contact_consent','conversion_events',
    'customer_referral_events','customer_referral_programs','frequency_cap_log',
    'lifecycle_trigger_log','lifecycle_triggers','next_best_actions',
    'processed_webhook_events','voice_ai_sessions'
  ]);
  IF policy_count <> 21 THEN
    RAISE EXCEPTION 'expected 21 replacement policies, got %', policy_count;
  END IF;

  -- anon and sandbox have no table privileges on any target.
  FOREACH t IN ARRAY ARRAY[
    'ai_campaign_segments','business_rules','contact_consent','conversion_events',
    'customer_referral_events','customer_referral_programs','frequency_cap_log',
    'lifecycle_trigger_log','lifecycle_triggers','next_best_actions',
    'processed_webhook_events','voice_ai_sessions'
  ] LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','sandbox_exec'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name, 'public.'||t, privilege_name) THEN
          RAISE EXCEPTION '% retains % on %', role_name, privilege_name, t;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('service_role', 'public.'||t, privilege_name) THEN
        RAISE EXCEPTION 'service_role missing % on %', privilege_name, t;
      END IF;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('service_role', 'public.'||t, privilege_name) THEN
        RAISE EXCEPTION 'service_role retains excessive % on %', privilege_name, t;
      END IF;
    END LOOP;
  END LOOP;

  -- Authenticated config tables get DML; read/event tables SELECT only; service logs none.
  FOREACH t IN ARRAY ARRAY['ai_campaign_segments','business_rules','customer_referral_programs','lifecycle_triggers'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('authenticated','public.'||t,privilege_name) THEN
        RAISE EXCEPTION 'authenticated missing % on %', privilege_name, t;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['contact_consent','conversion_events','customer_referral_events','next_best_actions','voice_ai_sessions'] LOOP
    IF NOT has_table_privilege('authenticated','public.'||t,'SELECT') THEN
      RAISE EXCEPTION 'authenticated missing SELECT on %', t;
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated','public.'||t,privilege_name) THEN
        RAISE EXCEPTION 'authenticated retains excessive % on %', privilege_name, t;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['frequency_cap_log','lifecycle_trigger_log','processed_webhook_events'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('authenticated','public.'||t,privilege_name) THEN
        RAISE EXCEPTION 'authenticated retains % on service-only %', privilege_name, t;
      END IF;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.workspaces(id,owner_id) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','member'),
 ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','viewer');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','admin');

INSERT INTO public.ai_campaign_segments(workspace_id,payload) VALUES ('11111111-1111-4111-8111-111111111111','segment-a');
INSERT INTO public.business_rules(workspace_id,payload) VALUES ('11111111-1111-4111-8111-111111111111','rule-a');
INSERT INTO public.contact_consent(workspace_id,payload) VALUES ('11111111-1111-4111-8111-111111111111','consent-a');
INSERT INTO public.voice_ai_sessions(workspace_id,payload) VALUES ('11111111-1111-4111-8111-111111111111','voice-a');
SQL

as_user() {
  local uid="$1" sql="$2"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt \
    -c "SET ROLE authenticated; SET request.jwt.claim.sub = '$uid'; $sql"
}
expect_value() {
  local uid="$1" sql="$2" expected="$3" label="$4" out
  out="$(as_user "$uid" "$sql")"
  if [[ "$out" != "$expected" ]]; then
    echo "ERROR: $label expected '$expected', got '$out'"
    exit 1
  fi
}
expect_fail() {
  local uid="$1" sql="$2" label="$3"
  if as_user "$uid" "$sql" >/dev/null 2>&1; then
    echo "ERROR: $label unexpectedly succeeded"
    exit 1
  fi
}

OWNER_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ADMIN_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
MEMBER_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
VIEWER_A='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
NON_MEMBER='99999999-9999-4999-8999-999999999999'
PLATFORM_ADMIN='ffffffff-ffff-4fff-8fff-ffffffffffff'
WA='11111111-1111-4111-8111-111111111111'
WB='22222222-2222-4222-8222-222222222222'

expect_value "$VIEWER_A" "SELECT count(*) FROM public.ai_campaign_segments;" "1" "viewer read config"
expect_value "$VIEWER_A" "SELECT count(*) FROM public.contact_consent;" "1" "viewer read event"
expect_value "$MEMBER_A" "SELECT count(*) FROM public.voice_ai_sessions;" "1" "member read voice session"
expect_value "$NON_MEMBER" "SELECT count(*) FROM public.ai_campaign_segments;" "0" "non-member tenant read"
expect_value "$PLATFORM_ADMIN" "SELECT count(*) FROM public.ai_campaign_segments;" "0" "platform admin automatic tenant read"
expect_value "$PLATFORM_ADMIN" "SELECT count(*) FROM public.business_rules;" "0" "platform admin automatic rules read"

as_user "$MEMBER_A" "INSERT INTO public.ai_campaign_segments(workspace_id,payload) VALUES ('$WA','member-ok');" >/dev/null
expect_fail "$MEMBER_A" "INSERT INTO public.ai_campaign_segments(workspace_id,payload) VALUES ('$WB','foreign');" "foreign workspace segment insert"
expect_fail "$VIEWER_A" "INSERT INTO public.ai_campaign_segments(workspace_id,payload) VALUES ('$WA','viewer-write');" "viewer write"
expect_fail "$MEMBER_A" "DELETE FROM public.ai_campaign_segments WHERE payload='segment-a';" "member delete"
as_user "$ADMIN_A" "DELETE FROM public.ai_campaign_segments WHERE payload='segment-a';" >/dev/null

expect_fail "$MEMBER_A" "INSERT INTO public.business_rules(workspace_id,payload) VALUES ('$WA','member-rule');" "member business rule write"
as_user "$ADMIN_A" "INSERT INTO public.business_rules(workspace_id,payload) VALUES ('$WA','admin-rule');" >/dev/null

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt \
  -c "SET ROLE anon; SELECT count(*) FROM public.contact_consent;" >/dev/null 2>&1; then
  echo "ERROR: anon can still read contact_consent"
  exit 1
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -qAt \
  -c "SET ROLE service_role; INSERT INTO public.frequency_cap_log(workspace_id,payload) VALUES ('$WA','service-log'); INSERT INTO public.processed_webhook_events(workspace_id,payload) VALUES ('$WA','service-webhook');" >/dev/null

echo "Critical public/self-correlated RLS bypass closure: PASS"
