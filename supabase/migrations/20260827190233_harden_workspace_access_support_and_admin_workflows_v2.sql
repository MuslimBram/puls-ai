-- Remove policies that depend on legacy helper signatures first.
DROP POLICY IF EXISTS "workspace data access helper policy placeholder" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "platform operators can manage workspace assignments" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "platform operators manage workspace assignments" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "users can read their own workspace assignments" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "users read their active assignments" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "users can read their own assignments" ON public.workspace_access_assignments;
DROP POLICY IF EXISTS "users read their own assignments" ON public.workspace_access_assignments;

DROP FUNCTION IF EXISTS public.is_platform_operator(uuid);
DROP FUNCTION IF EXISTS public.has_workspace_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.has_workspace_access(_workspace uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT (SELECT auth.uid()) IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=(SELECT auth.uid())) OR EXISTS(SELECT 1 FROM public.workspace_access_assignments waa WHERE waa.workspace_id=_workspace AND waa.user_id=(SELECT auth.uid()) AND waa.is_active AND (waa.expires_at IS NULL OR waa.expires_at>now()))); $$;
CREATE OR REPLACE FUNCTION public.is_platform_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=(SELECT auth.uid()) AND ur.role IN ('super_admin','admin')); $$;
CREATE OR REPLACE FUNCTION public.has_workspace_access_for_user(_workspace uuid,_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT _user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=_workspace AND wm.user_id=_user) OR EXISTS(SELECT 1 FROM public.workspace_access_assignments waa WHERE waa.workspace_id=_workspace AND waa.user_id=_user AND waa.is_active AND (waa.expires_at IS NULL OR waa.expires_at>now()))); $$;

CREATE TABLE IF NOT EXISTS public.workspace_support_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 support_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000), scopes text[] NOT NULL CHECK(cardinality(scopes)>0),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, audit_log_id uuid REFERENCES public.audit_logs(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(expires_at>created_at), CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX IF NOT EXISTS idx_workspace_support_sessions_active ON public.workspace_support_sessions(support_user_id,workspace_id,expires_at) WHERE revoked_at IS NULL;
ALTER TABLE public.workspace_support_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "support users can view their own sessions" ON public.workspace_support_sessions;
DROP POLICY IF EXISTS "platform operators can create support sessions" ON public.workspace_support_sessions;
DROP POLICY IF EXISTS "platform operators can revoke their support sessions" ON public.workspace_support_sessions;
CREATE POLICY "support users can view their own sessions" ON public.workspace_support_sessions FOR SELECT TO authenticated USING(support_user_id=(SELECT auth.uid()));
CREATE POLICY "platform operators can create support sessions" ON public.workspace_support_sessions FOR INSERT TO authenticated WITH CHECK(support_user_id=(SELECT auth.uid()) AND public.is_platform_operator());
CREATE POLICY "platform operators can revoke their support sessions" ON public.workspace_support_sessions FOR UPDATE TO authenticated USING(support_user_id=(SELECT auth.uid()) AND public.is_platform_operator()) WITH CHECK(support_user_id=(SELECT auth.uid()) AND public.is_platform_operator());
CREATE OR REPLACE FUNCTION public.has_active_support_scope(_workspace uuid,_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS(SELECT 1 FROM public.workspace_support_sessions s WHERE s.workspace_id=_workspace AND s.support_user_id=(SELECT auth.uid()) AND s.revoked_at IS NULL AND s.expires_at>now() AND _scope=ANY(s.scopes)); $$;

CREATE POLICY "platform operators manage workspace assignments" ON public.workspace_access_assignments FOR ALL TO authenticated USING(public.is_platform_operator()) WITH CHECK(public.is_platform_operator());
CREATE POLICY "users read their own assignments" ON public.workspace_access_assignments FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

REVOKE ALL ON TABLE public.workspace_access_assignments FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.workspace_access_assignments TO authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public.workspace_access_assignments FROM authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.workspace_access_assignments TO service_role;
REVOKE ALL ON TABLE public.workspace_support_sessions FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.workspace_support_sessions TO authenticated;
REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.workspace_support_sessions FROM authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.workspace_support_sessions TO service_role;

REVOKE ALL ON FUNCTION public.has_workspace_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.has_workspace_access_for_user(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_access_for_user(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_platform_operator() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.has_active_support_scope(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_support_scope(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.request_admin_role(_target_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id uuid; BEGIN
 IF NOT(public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'admin')) THEN RAISE EXCEPTION 'Only Owner or Pulse AI Admin can request another Pulse AI Admin'; END IF;
 IF _target_user_id IS NULL OR _target_user_id=(SELECT auth.uid()) THEN RAISE EXCEPTION 'A different registered user is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target_user_id) THEN RAISE EXCEPTION 'Target user must be registered before an admin request can be created'; END IF;
 IF public.has_role(_target_user_id,'admin') OR public.has_role(_target_user_id,'super_admin') THEN RAISE EXCEPTION 'User already has a platform admin role'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_role_requests WHERE target_user_id=_target_user_id AND status='pending') THEN RAISE EXCEPTION 'A pending admin request already exists for this user'; END IF;
 INSERT INTO public.admin_role_requests(target_user_id,requested_by,requested_role,status,ai_status) VALUES(_target_user_id,(SELECT auth.uid()),'admin','pending','pending') RETURNING id INTO v_id; RETURN v_id; END $$;
CREATE OR REPLACE FUNCTION public.approve_admin_role(_request_id uuid,_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_target uuid; v_requester uuid; v_ai text; v_status text; BEGIN
 IF NOT(public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'admin')) THEN RAISE EXCEPTION 'Only Owner or Pulse AI Admin can approve a Pulse AI Admin'; END IF;
 IF _reason IS NULL OR length(btrim(_reason))<10 THEN RAISE EXCEPTION 'Approval reason is required'; END IF;
 SELECT target_user_id,requested_by,ai_status,status INTO v_target,v_requester,v_ai,v_status FROM public.admin_role_requests WHERE id=_request_id FOR UPDATE;
 IF NOT FOUND OR v_status<>'pending' THEN RAISE EXCEPTION 'Pending admin request not found'; END IF;
 IF v_requester=(SELECT auth.uid()) THEN RAISE EXCEPTION 'The requesting admin cannot approve their own request'; END IF;
 IF v_ai<>'approved' THEN RAISE EXCEPTION 'AI approval is required before human approval'; END IF;
 IF public.has_role(v_target,'admin') OR public.has_role(v_target,'super_admin') THEN RAISE EXCEPTION 'User already has a platform admin role'; END IF;
 INSERT INTO public.user_roles(user_id,role) VALUES(v_target,'admin') ON CONFLICT DO NOTHING;
 UPDATE public.admin_role_requests SET status='approved',human_approver_id=(SELECT auth.uid()),human_approval_role=CASE WHEN public.has_role((SELECT auth.uid()),'super_admin') THEN 'super_admin' ELSE 'admin' END,human_approved_at=now(),human_reason=_reason,updated_at=now() WHERE id=_request_id;
END $$;
CREATE OR REPLACE FUNCTION public.reject_admin_role(_request_id uuid,_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT(public.has_role((SELECT auth.uid()),'super_admin') OR public.has_role((SELECT auth.uid()),'admin')) THEN RAISE EXCEPTION 'Only platform admins can reject an admin request'; END IF;
 IF _reason IS NULL OR length(btrim(_reason))<10 THEN RAISE EXCEPTION 'Rejection reason is required'; END IF;
 UPDATE public.admin_role_requests SET status='rejected',human_approver_id=(SELECT auth.uid()),human_approval_role=CASE WHEN public.has_role((SELECT auth.uid()),'super_admin') THEN 'super_admin' ELSE 'admin' END,human_approved_at=now(),human_reason=_reason,updated_at=now() WHERE id=_request_id AND status='pending' AND requested_by<>(SELECT auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending admin request not found or self-rejection is not allowed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.request_admin_role(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.request_admin_role(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_admin_role(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.approve_admin_role(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_admin_role(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.reject_admin_role(uuid,text) TO authenticated;