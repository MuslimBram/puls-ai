-- R4a2: competitors + competitor_alerts, intentionally separate from PR #166.
DO $$
DECLARE bad bigint;
BEGIN
  SELECT count(*) INTO bad FROM public.competitors c
  WHERE c.workspace_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=c.workspace_id)
     OR NOT (
       EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=c.workspace_id AND w.owner_id=c.user_id)
       OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=c.workspace_id AND m.user_id=c.user_id)
       OR EXISTS(SELECT 1 FROM public.workspace_access_assignments a WHERE a.workspace_id=c.workspace_id AND a.user_id=c.user_id AND a.is_active AND (a.expires_at IS NULL OR a.expires_at>pg_catalog.now()))
     );
  IF bad<>0 THEN RAISE EXCEPTION 'R4a2 guard: competitors has % invalid tenant rows',bad; END IF;

  SELECT count(*) INTO bad FROM public.competitor_alerts a
  WHERE a.workspace_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=a.workspace_id)
     OR NOT (
       EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=a.workspace_id AND w.owner_id=a.user_id)
       OR EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=a.workspace_id AND m.user_id=a.user_id)
       OR EXISTS(SELECT 1 FROM public.workspace_access_assignments x WHERE x.workspace_id=a.workspace_id AND x.user_id=a.user_id AND x.is_active AND (x.expires_at IS NULL OR x.expires_at>pg_catalog.now()))
     );
  IF bad<>0 THEN RAISE EXCEPTION 'R4a2 guard: competitor_alerts has % invalid tenant rows',bad; END IF;

  SELECT count(*) INTO bad
  FROM public.competitor_alerts a JOIN public.competitors c ON c.id=a.competitor_id
  WHERE a.workspace_id IS DISTINCT FROM c.workspace_id;
  IF bad<>0 THEN RAISE EXCEPTION 'R4a2 guard: % competitor-alert parent mismatches',bad; END IF;
END $$;

ALTER TABLE public.competitors ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.competitor_alerts ALTER COLUMN workspace_id SET NOT NULL;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN('competitors','competitor_alerts') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename);
  END LOOP;
END $$;

CREATE POLICY "Workspace members can view competitors" ON public.competitors FOR SELECT TO authenticated USING(public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own competitors" ON public.competitors FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update competitors" ON public.competitors FOR UPDATE TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin','member'])) WITH CHECK(public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete competitors" ON public.competitors FOR DELETE TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

CREATE POLICY "Workspace members can view competitor alerts" ON public.competitor_alerts FOR SELECT TO authenticated USING(public.has_workspace_access(workspace_id));
CREATE POLICY "Workspace members can insert own competitor alerts" ON public.competitor_alerts FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace members can update competitor alerts" ON public.competitor_alerts FOR UPDATE TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin','member'])) WITH CHECK(public.has_workspace_role(workspace_id,ARRAY['owner','admin','member']));
CREATE POLICY "Workspace admins can delete competitor alerts" ON public.competitor_alerts FOR DELETE TO authenticated USING(public.has_workspace_role(workspace_id,ARRAY['owner','admin']));

CREATE OR REPLACE FUNCTION public.enforce_r4a2_competitor_alert_workspace()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $function$
DECLARE parent_workspace uuid;
BEGIN
  SELECT c.workspace_id INTO parent_workspace FROM public.competitors c WHERE c.id=NEW.competitor_id;
  IF parent_workspace IS NULL THEN RAISE EXCEPTION 'COMPETITOR_PARENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF parent_workspace IS DISTINCT FROM NEW.workspace_id THEN RAISE EXCEPTION 'COMPETITOR_ALERT_WORKSPACE_MISMATCH' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;$function$;
REVOKE ALL ON FUNCTION public.enforce_r4a2_competitor_alert_workspace() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_r4a2_competitor_alert_workspace() TO service_role;
DROP TRIGGER IF EXISTS trg_r4a2_competitor_alert_workspace ON public.competitor_alerts;
CREATE TRIGGER trg_r4a2_competitor_alert_workspace BEFORE INSERT OR UPDATE OF competitor_id,workspace_id ON public.competitor_alerts FOR EACH ROW EXECUTE FUNCTION public.enforce_r4a2_competitor_alert_workspace();

REVOKE ALL ON TABLE public.competitors FROM PUBLIC,anon;
REVOKE ALL ON TABLE public.competitor_alerts FROM PUBLIC,anon;
