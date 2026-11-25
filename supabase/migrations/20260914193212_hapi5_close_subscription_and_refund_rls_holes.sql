-- ============================================================================
-- HAPI 5 / STEP 1 (4,5) — two live privilege holes, closed.
--
-- (4) policy "Users can insert own subscription" on public.subscriptions:
--        INSERT ... WITH CHECK (auth.uid() = user_id)
--     The matching UPDATE policy was dropped long ago, but INSERT never was.
--     Any authenticated user without a subscriptions row could therefore
--     insert one with plan='enterprise', subscription_status='active' — and
--     every backend gate reads subscriptions.plan. Rows are created by the
--     handle_new_user trigger (SECURITY DEFINER) and by the payment functions
--     (service_role); neither needs this policy.
--
-- (5) policy "Users can request refunds" on public.subscription_refunds:
--        INSERT ... WITH CHECK (user_id = auth.uid())
--     The browser could write refund rows directly, bypassing every eligibility
--     check in the request-refund edge function (refund window, renewal state,
--     usage thresholds) — and an approved refund row cancels partner
--     commissions downstream. Refund requests must go through that function,
--     which runs as service_role.
--
-- Backward-safe: only the two INSERT policies are removed. SELECT for users and
-- ALL for admins are untouched, so nothing a user can legitimately see changes.
-- Verified before applying: public.subscriptions has 4 rows, none self-inserted
-- (0 rows with a paid plan and no stripe id); public.subscription_refunds is
-- empty. Nothing is being taken away from existing data.
-- ============================================================================

drop policy if exists "Users can insert own subscription" on public.subscriptions;
drop policy if exists "Users can request refunds" on public.subscription_refunds;;
