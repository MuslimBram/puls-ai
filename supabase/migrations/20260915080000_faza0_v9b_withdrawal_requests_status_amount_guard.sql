-- FAZA 0 / V9b — withdrawal_requests: status + amount integrity guard
--
-- STATUS: PREPARED, NOT APPLIED. Do not run without explicit owner approval.
--
-- ── The gap this closes ──────────────────────────────────────────────────────
-- public.withdrawal_requests accepts an arbitrary `status` and an arbitrary
-- `amount` straight from the browser. Verified in production on 2026-09-15:
--
--   * RLS INSERT policy "Users can insert own withdrawal requests" has
--     WITH CHECK (user_id = auth.uid()) — it constrains ownership and NOTHING
--     else, so `status` is unconstrained on insert.
--   * There is NO trigger on public.withdrawal_requests. The guard function
--     public.withdrawal_requests_enforce_initial_status() DOES exist, but
--     pg_trigger shows it attached to public.platform_withdrawal_requests —
--     a different table from the one its name refers to.
--   * pg_constraint on withdrawal_requests returns only the primary key and two
--     foreign keys. No CHECK on `status`, no CHECK on `amount`.
--   * The column DEFAULT 'pending_ai_review' only applies when the client omits
--     the column; a client that sends one wins.
--
-- Net effect today: any signed-in user can insert
--   { user_id: <self>, amount: <any value, negative included>, status: 'approved' }
-- and the row is accepted.
--
-- This is not currently a theft path: no deployed function pays out on
-- withdrawal_requests.status (see report 44, G12 — the queue has no executor).
-- It becomes one the day that executor is built, which is exactly the work this
-- authorisation is preparing for. Hence: close it before, not after.
--
-- ── Why a new function instead of attaching the existing one ─────────────────
-- public.withdrawal_requests_enforce_initial_status() forces status := 'pending'.
-- That value is not in this table's vocabulary — the app writes and reads
-- 'pending_ai_review'. Attaching it verbatim would have silently broken
-- withdrawal-fraud-check and FreelancerBusinessPurchase. A table-specific
-- function is used instead; the existing one is left untouched on
-- platform_withdrawal_requests.
--
-- Non-destructive: adds constraints and a trigger only. No column is dropped,
-- altered or rewritten; no row is modified. public.withdrawal_requests held
-- 0 rows at authoring time, so neither CHECK can fail on existing data.

-- ── 1. status vocabulary ─────────────────────────────────────────────────────
-- Exactly the five values written or read anywhere in the codebase:
--   pending_ai_review     column default; written by the client on insert
--   pending_admin_review  written by withdrawal-fraud-check after scoring
--   blocked               written by withdrawal-fraud-check when risk >= 80
--   approved / rejected   written by an admin via AdminWithdrawalApproval
-- NOTE FOR THE FUTURE: when the payout executor (report 44, G12) is built it
-- will need terminal states such as 'processing' and 'paid'. Extend this list
-- in a follow-up migration at that point — deliberately not pre-added here, so
-- the constraint cannot silently accept a state nothing implements.
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN (
    'pending_ai_review',
    'pending_admin_review',
    'blocked',
    'approved',
    'rejected'
  ));

-- ── 2. amount must be a positive number ──────────────────────────────────────
-- Previously unconstrained: a negative amount was accepted.
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_amount_positive
  CHECK (amount > 0);

-- ── 3. the client may not choose its own status ──────────────────────────────
-- INSERT  : non-privileged callers are forced to 'pending_ai_review'.
-- UPDATE  : non-privileged callers may not change `status` at all.
-- service_role, admin and super_admin are unaffected — withdrawal-fraud-check
-- runs as service_role, and AdminWithdrawalApproval updates as an admin.
-- This is defence in depth: RLS already grants UPDATE to admins only. The
-- trigger makes the rule hold even if a policy is later loosened.
CREATE OR REPLACE FUNCTION public.withdrawal_requests_guard_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending_ai_review';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'withdrawal_requests.status may only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_withdrawal_requests_guard_status ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_requests_guard_status
  BEFORE INSERT OR UPDATE ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.withdrawal_requests_guard_status();
