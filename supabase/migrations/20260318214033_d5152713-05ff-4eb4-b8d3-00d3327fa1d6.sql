-- Remove user-level UPDATE policy on subscriptions
-- Only admins and backend (service_role) should modify subscription data
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;