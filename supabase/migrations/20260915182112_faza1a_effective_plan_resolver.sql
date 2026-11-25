-- FAZA 1A — one implementation of "which plan governs this account"
--
-- STATUS: PREPARED, NOT APPLIED. Do not run without explicit owner approval.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
-- The downgrade rules below are not trivial: an expired trial, a past-due
-- subscription inside its grace window, and a cancelled subscription each
-- resolve differently. That logic currently lives in TypeScript
-- (_shared/plan-limits.ts, promoted from enforce-limits v52).
--
-- The limit triggers in the sibling migrations need the same answer. Writing
-- the rules a second time in SQL would create two implementations that drift —
-- which is exactly how the AI reply limit tables ended up saying 20/100/500 in
-- two functions and 25/75/200 in the catalogue.
--
-- So: ONE function, called by the triggers. The edge functions keep their
-- TypeScript copy for now and a test asserts the two agree; migrating them onto
-- this RPC is a follow-up, deliberately not bundled into an enforcement change.
--
-- Non-destructive: creates one function. Nothing is dropped or rewritten.
-- SECURITY DEFINER with a pinned search_path, reading only subscriptions. It
-- grants no access a caller did not already have — it returns a plan key, not
-- data — and introduces no new cross-tenant read path.

CREATE OR REPLACE FUNCTION public.effective_plan_for_user(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT
      -- Legacy aliases, unioned from every function that had its own map:
      --   ai-router      { free -> standard, basic -> standard }
      --   enforce-limits { free -> standard, pro   -> professional }
      CASE COALESCE(sub.plan, 'standard')
        WHEN 'free'  THEN 'standard'
        WHEN 'basic' THEN 'standard'
        WHEN 'pro'   THEN 'professional'
        ELSE COALESCE(sub.plan, 'standard')
      END AS normalized,
      COALESCE(sub.subscription_status, 'active') AS status,
      sub.grace_period_end,
      sub.trial_end
    FROM public.subscriptions sub
    WHERE sub.user_id = _user_id
    LIMIT 1
  )
  SELECT COALESCE(
    (
      SELECT CASE
        -- expired trial that never converted
        WHEN s.trial_end IS NOT NULL AND s.trial_end < now() AND s.status = 'trialing'
          THEN 'standard'
        -- past due: keep the plan only while the grace window is open
        WHEN s.status = 'past_due'
          THEN CASE WHEN s.grace_period_end IS NOT NULL AND s.grace_period_end > now()
                    THEN s.normalized ELSE 'standard' END
        WHEN s.status IN ('canceled', 'unpaid')
          THEN 'standard'
        ELSE s.normalized
      END
      FROM s
    ),
    -- No subscription row at all resolves to the lowest publicly sold plan,
    -- never to "unlimited".
    'standard'
  );
$function$;

COMMENT ON FUNCTION public.effective_plan_for_user(uuid) IS
  'FAZA 1A: single source of plan resolution. Mirrors _shared/plan-limits.ts resolvePlanKey(). A missing subscription resolves to the lowest plan.';
;
