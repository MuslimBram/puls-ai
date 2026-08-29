-- R4a1: harden the first nine populated nullable-workspace tenant tables.
-- Production precondition verified 2026-08-29: 44 rows total, 0 NULL workspace_id,
-- 0 workspace orphans; knowledge_sources has 0 business/workspace mismatches.

DO $$
DECLARE
  _table text;
  _bad bigint;
  _policy_count integer;
  _expected integer;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'market_trends',
    'analytics_daily_snapshots',
    'automation_workflows',
    'knowledge_sources',
    'marketing_campaigns',
    'business_notifications',
    'demand_forecasts',
    'resource_planning_items',
    'personalization_rules'
  ] LOOP
    IF to_regclass(format('public.%I', _table)) IS NULL THEN
      RAISE EXCEPTION 'R4a1 guard: missing table %', _table;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM public.%I x WHERE x.workspace_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=x.workspace_id)',
      _table
    ) INTO _bad;
    IF _bad <> 0 THEN
      RAISE EXCEPTION 'R4a1 guard: % has % NULL/orphan workspace rows', _table, _bad;
    END IF;

    _expected := CASE _table
      WHEN 'market_trends' THEN 4
      WHEN 'analytics_daily_snapshots' THEN 2
      WHEN 'automation_workflows' THEN 1
      WHEN 'knowledge_sources' THEN 4
      WHEN 'marketing_campaigns' THEN 1
      WHEN 'business_notifications' THEN 1
      WHEN 'demand_forecasts' THEN 1
      WHEN 'resource_planning_items' THEN 1
      WHEN 'personalization_rules' THEN 1
    END;
    SELECT count(*) INTO _policy_count
    FROM pg_policies
    WHERE schemaname='public' AND tablename=_table;
    IF _policy_count <> _expected THEN
      RAISE EXCEPTION 'R4a1 guard: policy drift on %, expected %, found %', _table, _expected, _policy_count;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.knowledge_sources ks
    JOIN public.business_profiles bp ON bp.id=ks.business_id
    WHERE ks.workspace_id IS DISTINCT FROM bp.workspace_id
  ) THEN
    RAISE EXCEPTION 'R4a1 guard: knowledge_sources business/workspace mismatch exists';
  END IF;
END $$;

ALTER TABLE public.market_trends ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.analytics_daily_snapshots ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_workflows ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.knowledge_sources ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.marketing_campaigns ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.business_notifications ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.demand_forecasts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.resource_planning_items ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.personalization_rules ALTER COLUMN workspace_id SET NOT NULL;

-- Parent equality guard for knowledge_sources -> business_profiles.
CREATE OR REPLACE FUNCTION public.enforce_r4a1_knowledge_parent_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF NEW.business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.business_profiles bp
    WHERE bp.id=NEW.business_id
      AND bp.workspace_id=NEW.workspace_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='knowledge source workspace does not match business workspace';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_r4a1_knowledge_parent_workspace() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_r4a1_knowledge_parent_workspace ON public.knowledge_sources;
CREATE TRIGGER trg_r4a1_knowledge_parent_workspace
BEFORE INSERT OR UPDATE OF business_id, workspace_id ON public.knowledge_sources
FOR EACH ROW EXECUTE FUNCTION public.enforce_r4a1_knowledge_parent_workspace();

-- Remove legacy user-id-only policies.
DROP POLICY IF EXISTS "Users can delete own market_trends" ON public.market_trends;
DROP POLICY IF EXISTS "Users can insert own market_trends" ON public.market_trends;
DROP POLICY IF EXISTS "Users can update own market_trends" ON public.market_trends;
DROP POLICY IF EXISTS "Users can view own market_trends" ON public.market_trends;

DROP POLICY IF EXISTS "Service role can insert snapshots" ON public.analytics_daily_snapshots;
DROP POLICY IF EXISTS "Users can view own snapshots" ON public.analytics_daily_snapshots;

DROP POLICY IF EXISTS "Users can manage own automation_workflows" ON public.automation_workflows;

DROP POLICY IF EXISTS "Users can delete own knowledge_sources" ON public.knowledge_sources;
DROP POLICY IF EXISTS "Users can insert own knowledge_sources" ON public.knowledge_sources;
DROP POLICY IF EXISTS "Users can update own knowledge_sources" ON public.knowledge_sources;
DROP POLICY IF EXISTS "Users can view own knowledge_sources" ON public.knowledge_sources;

DROP POLICY IF EXISTS "Users manage own marketing campaigns" ON public.marketing_campaigns;
DROP POLICY IF EXISTS "Users can manage own business_notifications" ON public.business_notifications;
DROP POLICY IF EXISTS "Users manage own demand forecasts" ON public.demand_forecasts;
DROP POLICY IF EXISTS "Users manage own resource planning" ON public.resource_planning_items;
DROP POLICY IF EXISTS "Users manage own personalization rules" ON public.personalization_rules;

-- Canonical workspace policies. analytics_daily_snapshots intentionally keeps
-- only SELECT + INSERT because that is its current product surface.
CREATE POLICY "Workspace members can view analytics snapshots"
ON public.analytics_daily_snapshots FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own analytics snapshots"
ON public.analytics_daily_snapshots FOR INSERT TO authenticated
WITH CHECK (
  user_id=(SELECT auth.uid())
  AND public.has_workspace_role(workspace_id, ARRAY['owner','admin','member'])
);

DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'market_trends',
    'automation_workflows',
    'knowledge_sources',
    'marketing_campaigns',
    'business_notifications',
    'demand_forecasts',
    'resource_planning_items',
    'personalization_rules'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_workspace_access(workspace_id))',
      'Workspace members can view ' || _table, _table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''member'']))',
      'Workspace members can insert ' || _table, _table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''member''])) WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'',''member'']))',
      'Workspace members can update ' || _table, _table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, ARRAY[''owner'',''admin'']))',
      'Workspace admins can delete ' || _table, _table
    );
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.market_trends FROM anon;
REVOKE ALL ON TABLE public.analytics_daily_snapshots FROM anon;
REVOKE ALL ON TABLE public.automation_workflows FROM anon;
REVOKE ALL ON TABLE public.knowledge_sources FROM anon;
REVOKE ALL ON TABLE public.marketing_campaigns FROM anon;
REVOKE ALL ON TABLE public.business_notifications FROM anon;
REVOKE ALL ON TABLE public.demand_forecasts FROM anon;
REVOKE ALL ON TABLE public.resource_planning_items FROM anon;
REVOKE ALL ON TABLE public.personalization_rules FROM anon;

DO $$
DECLARE
  _table text;
  _bad bigint;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'market_trends','analytics_daily_snapshots','automation_workflows','knowledge_sources',
    'marketing_campaigns','business_notifications','demand_forecasts','resource_planning_items','personalization_rules'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I x WHERE x.workspace_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=x.workspace_id)',
      _table
    ) INTO _bad;
    IF _bad <> 0 THEN
      RAISE EXCEPTION 'R4a1 certification: % has % NULL/orphan workspace rows after hardening', _table, _bad;
    END IF;
  END LOOP;
END $$;
