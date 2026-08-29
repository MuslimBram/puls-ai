-- R4a batch 1: harden five populated tenant tables after live preconditions.
-- Scope: competitors, competitor_alerts, market_trends,
-- analytics_daily_snapshots, automation_workflows.

DO $$
DECLARE
  tbl text;
  bad bigint;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'competitors','competitor_alerts','market_trends',
    'analytics_daily_snapshots','automation_workflows'
  ] LOOP
    EXECUTE format(
      'select count(*) from public.%I x where x.workspace_id is null or not exists (select 1 from public.workspaces w where w.id=x.workspace_id)',
      tbl
    ) INTO bad;
    IF bad <> 0 THEN
      RAISE EXCEPTION 'R4a-B1 guard: % has % NULL/orphan workspace rows', tbl, bad;
    END IF;

    EXECUTE format(
      'select count(*) from public.%I x where not (
         exists(select 1 from public.workspaces w where w.id=x.workspace_id and w.owner_id=x.user_id)
         or exists(select 1 from public.workspace_members wm where wm.workspace_id=x.workspace_id and wm.user_id=x.user_id)
         or exists(select 1 from public.workspace_access_assignments waa where waa.workspace_id=x.workspace_id and waa.user_id=x.user_id and waa.is_active and (waa.expires_at is null or waa.expires_at>pg_catalog.now()))
       )',
      tbl
    ) INTO bad;
    IF bad <> 0 THEN
      RAISE EXCEPTION 'R4a-B1 guard: % has % user/workspace lineage mismatches', tbl, bad;
    END IF;
  END LOOP;

  SELECT count(*) INTO bad
  FROM public.competitor_alerts ca
  JOIN public.competitors c ON c.id=ca.competitor_id
  WHERE ca.workspace_id IS DISTINCT FROM c.workspace_id;
  IF bad <> 0 THEN
    RAISE EXCEPTION 'R4a-B1 guard: competitor_alerts has % parent workspace mismatches', bad;
  END IF;
END $$;

ALTER TABLE public.competitors ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.competitor_alerts ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.market_trends ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.analytics_daily_snapshots ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.automation_workflows ALTER COLUMN workspace_id SET NOT NULL;

-- Remove legacy user_id-only policies.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename = ANY(ARRAY[
        'competitors','competitor_alerts','market_trends',
        'analytics_daily_snapshots','automation_workflows'
      ])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- competitors
CREATE POLICY "Workspace members can view competitors"
ON public.competitors FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own competitors"
ON public.competitors FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update competitors"
ON public.competitors FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete competitors"
ON public.competitors FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

-- competitor_alerts
CREATE POLICY "Workspace members can view competitor alerts"
ON public.competitor_alerts FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own competitor alerts"
ON public.competitor_alerts FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update competitor alerts"
ON public.competitor_alerts FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete competitor alerts"
ON public.competitor_alerts FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

-- market_trends
CREATE POLICY "Workspace members can view market trends"
ON public.market_trends FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own market trends"
ON public.market_trends FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update market trends"
ON public.market_trends FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete market trends"
ON public.market_trends FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

-- analytics snapshots intentionally preserve the narrower browser surface:
-- SELECT + INSERT only. No browser UPDATE/DELETE policy is added.
CREATE POLICY "Workspace members can view analytics snapshots"
ON public.analytics_daily_snapshots FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own analytics snapshots"
ON public.analytics_daily_snapshots FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));

-- automation workflows
CREATE POLICY "Workspace members can view automation workflows"
ON public.automation_workflows FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own automation workflows"
ON public.automation_workflows FOR INSERT TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update automation workflows"
ON public.automation_workflows FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete automation workflows"
ON public.automation_workflows FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

-- Parent equality: alerts must stay in the same workspace as their competitor.
CREATE OR REPLACE FUNCTION public.enforce_r4a_competitor_alert_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  parent_workspace uuid;
BEGIN
  SELECT c.workspace_id INTO parent_workspace
  FROM public.competitors c
  WHERE c.id=NEW.competitor_id;

  IF parent_workspace IS NULL THEN
    RAISE EXCEPTION 'COMPETITOR_PARENT_NOT_FOUND' USING ERRCODE='23503';
  END IF;
  IF parent_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'COMPETITOR_ALERT_WORKSPACE_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_r4a_competitor_alert_workspace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_r4a_competitor_alert_workspace() TO service_role;

DROP TRIGGER IF EXISTS trg_r4a_competitor_alert_workspace ON public.competitor_alerts;
CREATE TRIGGER trg_r4a_competitor_alert_workspace
BEFORE INSERT OR UPDATE OF competitor_id, workspace_id
ON public.competitor_alerts
FOR EACH ROW EXECUTE FUNCTION public.enforce_r4a_competitor_alert_workspace();

-- Browser grants stay available where RLS authorizes them; anon is removed.
REVOKE ALL ON TABLE public.competitors FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.competitor_alerts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.market_trends FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.analytics_daily_snapshots FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.automation_workflows FROM PUBLIC, anon;

-- Re-certify structural preconditions rather than trusting FK metadata alone.
DO $$
DECLARE
  tbl text;
  bad bigint;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'competitors','competitor_alerts','market_trends',
    'analytics_daily_snapshots','automation_workflows'
  ] LOOP
    EXECUTE format(
      'select count(*) from public.%I x where x.workspace_id is null or not exists(select 1 from public.workspaces w where w.id=x.workspace_id)',
      tbl
    ) INTO bad;
    IF bad <> 0 THEN
      RAISE EXCEPTION 'R4a-B1 certification failed on %', tbl;
    END IF;
  END LOOP;
END $$;
