-- Corrective, not-yet-applied migration.
-- This file must be reviewed and applied separately; it intentionally does not
-- mutate Production as part of this PR.

-- A. Replace the browser-callable arbitrary-user helper with a caller-bound helper.
DROP FUNCTION IF EXISTS public.has_workspace_role(uuid, uuid, text[]);

CREATE OR REPLACE FUNCTION public.has_workspace_role(
  _workspace_id uuid,
  _roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.user_id = (SELECT auth.uid())
          AND wm.workspace_id = _workspace_id
          AND wm.role = ANY(_roles)
      )
      OR EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id = _workspace_id
          AND w.owner_id = (SELECT auth.uid())
          AND 'owner' = ANY(_roles)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role_for_user(
  _user_id uuid,
  _workspace_id uuid,
  _roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.user_id = _user_id
          AND wm.workspace_id = _workspace_id
          AND wm.role = ANY(_roles)
      )
      OR EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id = _workspace_id
          AND w.owner_id = _user_id
          AND 'owner' = ANY(_roles)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.has_workspace_role(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.has_workspace_role_for_user(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role_for_user(uuid, uuid, text[]) TO service_role;

-- B/C. Remove global platform-admin private-data bypass and enforce the
-- conservative workspace role matrix on the four core resources.

DROP POLICY IF EXISTS "workspace members can view business profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "workspace members can create business profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "workspace editors can update business profiles" ON public.business_profiles;
DROP POLICY IF EXISTS "workspace editors can delete business profiles" ON public.business_profiles;

CREATE POLICY "authorized workspace access can view business profiles"
ON public.business_profiles FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "workspace owners and admins can create business profiles"
ON public.business_profiles FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

CREATE POLICY "workspace owners and admins can update business profiles"
ON public.business_profiles FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']))
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

CREATE POLICY "workspace owners and admins can delete business profiles"
ON public.business_profiles FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "workspace members can view channels" ON public.channels;
DROP POLICY IF EXISTS "workspace members can create channels" ON public.channels;
DROP POLICY IF EXISTS "workspace editors can update channels" ON public.channels;
DROP POLICY IF EXISTS "workspace editors can delete channels" ON public.channels;

CREATE POLICY "authorized workspace access can view channels"
ON public.channels FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "workspace owners and admins can create channels"
ON public.channels FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

CREATE POLICY "workspace owners and admins can update channels"
ON public.channels FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']))
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

CREATE POLICY "workspace owners and admins can delete channels"
ON public.channels FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "workspace members can view leads" ON public.leads;
DROP POLICY IF EXISTS "workspace members can create leads" ON public.leads;
DROP POLICY IF EXISTS "workspace editors can update leads" ON public.leads;
DROP POLICY IF EXISTS "workspace editors can delete leads" ON public.leads;

CREATE POLICY "authorized workspace access can view leads"
ON public.leads FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "workspace members can create leads"
ON public.leads FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']));

CREATE POLICY "workspace members can update leads"
ON public.leads FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']));

CREATE POLICY "workspace owners and admins can delete leads"
ON public.leads FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS "workspace members can view conversation threads" ON public.conversation_threads;
DROP POLICY IF EXISTS "workspace members can create conversation threads" ON public.conversation_threads;
DROP POLICY IF EXISTS "workspace editors can update conversation threads" ON public.conversation_threads;
DROP POLICY IF EXISTS "workspace editors can delete conversation threads" ON public.conversation_threads;

CREATE POLICY "authorized workspace access can view conversation threads"
ON public.conversation_threads FOR SELECT TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "workspace members can create conversation threads"
ON public.conversation_threads FOR INSERT TO authenticated
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']));

CREATE POLICY "workspace members can update conversation threads"
ON public.conversation_threads FOR UPDATE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']))
WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner','admin','member']));

CREATE POLICY "workspace owners and admins can delete conversation threads"
ON public.conversation_threads FOR DELETE TO authenticated
USING (public.has_workspace_role(workspace_id, ARRAY['owner','admin']));

-- No platform-admin OR branch is intentionally present in any core SELECT policy.
