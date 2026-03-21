-- 1. FIX CRITICAL: Restrict workspace_branding anonymous access
DROP POLICY IF EXISTS "public_branding_for_widget" ON public.workspace_branding;

-- 2. FIX: Add read-only SELECT policy for stripe_product_plans
CREATE POLICY "authenticated_can_read_plans"
ON public.stripe_product_plans
FOR SELECT
TO authenticated
USING (true);

-- 3. FIX: Restrict audit_logs INSERT to prevent pollution
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

CREATE POLICY "authenticated_insert_own_audit_logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND action IS NOT NULL
  AND length(action) <= 200
);

-- 4. FIX: Restrict discount_audit_log INSERT to admins/controllers only
DROP POLICY IF EXISTS "Authenticated can insert discount_audit_log" ON public.discount_audit_log;

CREATE POLICY "admins_insert_discount_audit"
ON public.discount_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'controller'::app_role))
);