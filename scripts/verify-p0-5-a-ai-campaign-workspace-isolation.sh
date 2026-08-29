#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"
export PGPASSWORD
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
ADMIN_DB="${PGDATABASE:-postgres}"
DB_USER="${PGUSER:-postgres}"
MIGRATION="supabase/migrations/20260829120626_p0_5_a_ai_campaign_workspace_isolation.sql"
TEST_DB="p0_5_a_${GITHUB_RUN_ID:-local}_$$_${RANDOM}"
GUARD_LOG="/tmp/p0_5_a_guard_$$.log"

cleanup() {
  rm -f "$GUARD_LOG"
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
  BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE sandbox_exec NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
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

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL
);
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  role text NOT NULL
);
CREATE TABLE public.workspace_access_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  access_role text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz
);

CREATE FUNCTION public.has_workspace_access(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id=_workspace AND waa.user_id=auth.uid() AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
    )
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
    OR EXISTS (
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id=_workspace_id AND waa.user_id=auth.uid() AND waa.is_active
        AND (waa.expires_at IS NULL OR waa.expires_at > pg_catalog.now())
        AND (CASE waa.access_role
          WHEN 'business_admin' THEN 'admin'
          WHEN 'manager' THEN 'member'
          WHEN 'employee' THEN 'member'
          WHEN 'freelancer' THEN 'member'
        END)=ANY(_roles)
    )
  )
$$;
REVOKE ALL ON FUNCTION public.has_workspace_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_workspace_role(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid,text[]) TO authenticated, service_role;

CREATE TABLE public.business_profiles (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id)
);
CREATE TABLE public.content_posts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL
);
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  business_id uuid REFERENCES public.business_profiles(id),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  body text NOT NULL,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.campaign_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
  user_id uuid NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id),
  content_post_id uuid REFERENCES public.content_posts(id),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can delete own ai_conversations" ON public.ai_conversations FOR DELETE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can insert own ai_conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own ai_conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can view own ai_conversations" ON public.ai_conversations FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users manage own content" ON public.ai_content_library FOR ALL TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Users can delete own campaigns" ON public.campaigns FOR DELETE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can insert own campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can view own campaigns" ON public.campaigns FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can delete own campaign_content" ON public.campaign_content FOR DELETE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can insert own campaign_content" ON public.campaign_content FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own campaign_content" ON public.campaign_content FOR UPDATE TO authenticated USING (auth.uid()=user_id);
CREATE POLICY "Users can view own campaign_content" ON public.campaign_content FOR SELECT TO authenticated USING (auth.uid()=user_id);

GRANT ALL PRIVILEGES ON public.ai_conversations, public.ai_content_library, public.campaigns, public.campaign_content TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.ai_conversations, public.ai_content_library, public.campaigns, public.campaign_content TO sandbox_exec;

INSERT INTO public.workspaces(id,owner_id,name) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','A'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','B');
INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner'),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member'),
 ('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','viewer'),
 ('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member'),
 ('22222222-2222-4222-8222-222222222222','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','member');
INSERT INTO public.workspace_access_assignments(workspace_id,user_id,access_role,is_active,expires_at)
VALUES ('11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777','manager',true,now()-interval '1 day');

INSERT INTO public.business_profiles VALUES
 ('31111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
 ('32222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');
INSERT INTO public.content_posts VALUES
 ('41111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('42222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.campaigns(id,user_id,workspace_id,name) VALUES
 ('51111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A campaign'),
 ('52222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B campaign');
INSERT INTO public.ai_conversations(id,user_id,workspace_id,business_id) VALUES
 ('61111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','31111111-1111-4111-8111-111111111111'),
 ('62222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','32222222-2222-4222-8222-222222222222');
INSERT INTO public.ai_content_library(id,user_id,workspace_id,body) VALUES
 ('71111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','A'),
 ('72222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','B');
INSERT INTO public.campaign_content(id,campaign_id,user_id,workspace_id,content_post_id,body) VALUES
 ('81111111-1111-4111-8111-111111111111','51111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','41111111-1111-4111-8111-111111111111','A'),
 ('82222222-2222-4222-8222-222222222222','52222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','42222222-2222-4222-8222-222222222222','B'),
 ('83333333-3333-4333-8333-333333333333','52222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',NULL,'bad');
SQL

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >"$GUARD_LOG" 2>&1; then
  echo "ERROR: P0.5-A migration accepted a cross-workspace campaign parent"
  exit 1
fi
if ! grep -q "campaign workspace mismatch" "$GUARD_LOG"; then
  echo "ERROR: P0.5-A migration guard failed for an unexpected reason"
  cat "$GUARD_LOG"
  exit 1
fi

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "DELETE FROM public.campaign_content WHERE id='83333333-3333-4333-8333-333333333333';" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  tbl text;
  role_name text;
  privilege_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['ai_conversations','ai_content_library','campaigns','campaign_content'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=tbl AND column_name='workspace_id' AND is_nullable <> 'NO'
    ) THEN
      RAISE EXCEPTION 'workspace_id remains nullable on %', tbl;
    END IF;

    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=tbl) <> 4 THEN
      RAISE EXCEPTION 'expected exactly four workspace policies on %', tbl;
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon','sandbox_exec'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name, format('public.%I',tbl), privilege_name) THEN
          RAISE EXCEPTION '% retains % on %', role_name, privilege_name, tbl;
        END IF;
      END LOOP;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY['authenticated','service_role'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
        IF NOT has_table_privilege(role_name, format('public.%I',tbl), privilege_name) THEN
          RAISE EXCEPTION '% missing % on %', role_name, privilege_name, tbl;
        END IF;
      END LOOP;
      FOREACH privilege_name IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(role_name, format('public.%I',tbl), privilege_name) THEN
          RAISE EXCEPTION '% retains excessive % on %', role_name, privilege_name, tbl;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('ai_conversations','ai_content_library','campaigns','campaign_content')
      AND (coalesce(qual,'') LIKE '%auth.uid() = user_id%' OR coalesce(with_check,'') = '(auth.uid() = user_id)')
  ) THEN
    RAISE EXCEPTION 'legacy user_id-only policy remains';
  END IF;
END $$;
SQL

as_user() {
  local uid="$1"
  local sql="$2"
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
MEMBER_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
VIEWER_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
DUAL='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
PLATFORM='ffffffff-ffff-4fff-8fff-ffffffffffff'
EXPIRED='77777777-7777-4777-8777-777777777777'
WA='11111111-1111-4111-8111-111111111111'
WB='22222222-2222-4222-8222-222222222222'

expect_value "$MEMBER_A" "SELECT count(*) FROM public.ai_conversations;" "1" "cross-workspace SELECT"
expect_value "$VIEWER_A" "SELECT count(*) FROM public.campaigns;" "1" "viewer SELECT"
expect_value "$PLATFORM" "SELECT count(*) FROM public.ai_content_library;" "0" "platform admin automatic read"
expect_value "$EXPIRED" "SELECT count(*) FROM public.campaign_content;" "0" "expired assignment read"

expect_fail "$VIEWER_A" "INSERT INTO public.ai_content_library(user_id,workspace_id,body) VALUES ('$VIEWER_A','$WA','viewer write');" "viewer write"
expect_fail "$MEMBER_A" "INSERT INTO public.ai_content_library(user_id,workspace_id,body) VALUES ('$MEMBER_A','$WB','foreign');" "foreign workspace insert"
expect_fail "$MEMBER_A" "INSERT INTO public.ai_content_library(user_id,workspace_id,body) VALUES ('$OWNER_A','$WA','spoof');" "spoofed user_id insert"

as_user "$MEMBER_A" "UPDATE public.ai_conversations SET status='member-updated' WHERE id='61111111-1111-4111-8111-111111111111';" >/dev/null
expect_value "$MEMBER_A" "SELECT status FROM public.ai_conversations WHERE id='61111111-1111-4111-8111-111111111111';" "member-updated" "member workspace update"

as_user "$DUAL" "INSERT INTO public.campaigns(user_id,workspace_id,name) VALUES ('$DUAL','$WA','dual');" >/dev/null
expect_fail "$DUAL" "UPDATE public.campaigns SET workspace_id='$WB' WHERE user_id='$DUAL' AND name='dual';" "workspace-moving update"
expect_fail "$DUAL" "UPDATE public.campaigns SET user_id='$OWNER_A' WHERE user_id='$DUAL' AND name='dual';" "creator identity update"

as_user "$MEMBER_A" "DELETE FROM public.campaigns WHERE id='51111111-1111-4111-8111-111111111111';" >/dev/null
expect_value "$MEMBER_A" "SELECT count(*) FROM public.campaigns WHERE id='51111111-1111-4111-8111-111111111111';" "1" "member delete denied"
as_user "$OWNER_A" "DELETE FROM public.campaign_content WHERE id='81111111-1111-4111-8111-111111111111'; DELETE FROM public.campaigns WHERE id='51111111-1111-4111-8111-111111111111';" >/dev/null
expect_value "$OWNER_A" "SELECT count(*) FROM public.campaigns WHERE id='51111111-1111-4111-8111-111111111111';" "0" "owner delete"

expect_fail "$MEMBER_A" "INSERT INTO public.ai_conversations(user_id,workspace_id,business_id) VALUES ('$MEMBER_A','$WA','32222222-2222-4222-8222-222222222222');" "foreign business parent"
expect_fail "$MEMBER_A" "INSERT INTO public.campaign_content(campaign_id,user_id,workspace_id,body) VALUES ('52222222-2222-4222-8222-222222222222','$MEMBER_A','$WA','bad campaign');" "foreign campaign parent"
expect_fail "$MEMBER_A" "INSERT INTO public.campaigns(user_id,workspace_id,name) VALUES ('$MEMBER_A','$WA','parent'); INSERT INTO public.campaign_content(campaign_id,user_id,workspace_id,content_post_id,body) SELECT id,'$MEMBER_A','$WA','42222222-2222-4222-8222-222222222222','bad post' FROM public.campaigns WHERE user_id='$MEMBER_A' AND name='parent';" "foreign content post parent"

echo "P0.5-A AI/campaign workspace isolation: PASS"