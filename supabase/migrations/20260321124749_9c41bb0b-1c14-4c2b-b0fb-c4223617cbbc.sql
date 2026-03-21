-- 1. Secure platform_health_checks - deny writes except admin
CREATE POLICY "admins_write_health_checks"
ON public.platform_health_checks
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Secure saas_metrics_snapshots - deny writes except admin
CREATE POLICY "admins_write_saas_metrics"
ON public.saas_metrics_snapshots
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Secure cohort_retention - deny writes except admin
CREATE POLICY "admins_write_cohort_retention"
ON public.cohort_retention
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Allow referred users to view their own referral record
CREATE POLICY "referred_users_can_view_own_referral"
ON public.business_referrals
FOR SELECT
TO authenticated
USING (referred_user_id = auth.uid());