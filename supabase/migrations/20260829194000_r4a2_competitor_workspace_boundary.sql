-- R4a2: harden populated competitors + competitor_alerts.
DO $$
DECLARE _bad bigint; _policies integer;
BEGIN
  IF to_regclass('public.competitors') IS NULL OR to_regclass('public.competitor_alerts') IS NULL THEN
    RAISE EXCEPTION 'R4a2 guard: competitor tables missing';
  END IF;
  SELECT count(*) INTO _bad FROM public.competitors c
   WHERE c.workspace_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=c.workspace_id);
  IF _bad<>0 THEN RAISE EXCEPTION 'R4a2 guard: competitors has % NULL/orphan workspace rows',_bad; END IF;
  SELECT count(*) INTO _bad FROM public.competitor_alerts a
   WHERE a.workspace_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=a.workspace_id);
  IF _bad<>0 THEN RAISE EXCEPTION 'R4a2 guard: competitor_alerts has % NULL/orphan workspace rows',_bad; END IF;
  IF EXISTS(
    SELECT 1 FROM public.competitor_alerts a JOIN public.competitors c ON c.id=a.competitor_id
    WHERE a.workspace_id IS DISTINCT FROM c.workspace_id
  ) THEN RAISE EXCEPTION 'R4a2 guard: competitor alert parent/workspace mismatch exists'; END IF;
  SELECT count(*) INTO _policies FROM pg_policies WHERE schemaname='public' AND tablename='competitors';
  IF _policies<>4 THEN RAISE EXCEPTION 'R4a2 guard: competitors policy drift'; END IF;
  SELECT count(*) INTO _policies FROM pg_policies WHERE schemaname='public' AND tablename='competitor_alerts';
  IF _policies<>4 THEN RAISE EXCEPTION 'R4a2 guard: competitor_alerts policy drift'; END IF;
END $$;

ALTER TABLE public.competitors ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.competitor_alerts ALTER COLUMN workspace_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_r4a2_competitor_alert_parent_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.competitors c
    WHERE c.id=NEW.competitor_id AND c.workspace_id=NEW.workspace_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='competitor alert workspace does not match competitor workspace';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_r4a2_competitor_alert_parent_workspace() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_r4a2_competitor_alert_parent_workspace ON public.competitor_alerts;
CREATE TRIGGER trg_r4a2_competitor_alert_parent_workspace
BEFORE INSERT OR UPDATE OF competitor_id,workspace_id ON public.competitor_alerts
FOR EACH ROW EXECUTE FUNCTION public.enforce_r4a2_competitor_alert_parent_workspace();

DROP POLICY IF EXISTS "Users can delete own competitors" ON public.competitors;
DROP POLICY IF EXISTS "Users can insert own competitors" ON public.competitors;
DROP POLICY IF EXISTS "Users can update own competitors" ON public.competitors;
DROP POLICY IF EXISTS "Users can view own competitors" ON public.competitors;
DROP POLICY IF EXISTS "Users can delete own competitor_alerts" ON public.competitor_alerts;
DROP POLICY IF EXISTS "Users can insert own competitor_alerts" ON public.competitor_alerts;
DROP POLICY IF EXISTS "Users can update own competitor_alerts" ON public.competitor_alerts;
DROP POLICY IF EXISTS "Users can view own competitor_alerts" ON public.competitor_alerts;

DO $$ DECLARE _table text; BEGIN
  FOREACH _table IN ARRAY ARRAY['competitors','competitor_alerts'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_workspace_access(workspace_id))','Workspace members can view '||_table,_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY[''owner'',''admin'',''member'']))','Workspace members can insert '||_table,_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id,ARRAY[''owner'',''admin'']) OR (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY[''member'']))) WITH CHECK (public.has_workspace_role(workspace_id,ARRAY[''owner'',''admin'']) OR (user_id=(SELECT auth.uid()) AND public.has_workspace_role(workspace_id,ARRAY[''member''])))','Workspace authors or admins can update '||_table,_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id,ARRAY[''owner'',''admin'']))','Workspace admins can delete '||_table,_table);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.competitors FROM anon;
REVOKE ALL ON TABLE public.competitor_alerts FROM anon;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.competitors WHERE workspace_id IS NULL) OR EXISTS(SELECT 1 FROM public.competitor_alerts WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'R4a2 certification: NULL workspace remains';
  END IF;
  IF EXISTS(SELECT 1 FROM public.competitor_alerts a JOIN public.competitors c ON c.id=a.competitor_id WHERE a.workspace_id IS DISTINCT FROM c.workspace_id) THEN
    RAISE EXCEPTION 'R4a2 certification: parent mismatch remains';
  END IF;
END $$;
