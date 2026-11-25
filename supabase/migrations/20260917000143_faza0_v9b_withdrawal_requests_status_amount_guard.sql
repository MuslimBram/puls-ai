-- FAZA 0 / V9b — withdrawal_requests: status + amount integrity guard
-- Non-destructive: adds constraints and a trigger only. No column is dropped,
-- altered or rewritten; no row is modified. public.withdrawal_requests held
-- 0 rows at authoring time, so neither CHECK can fail on existing data.

-- 1. status vocabulary (exactly the five values written or read in the codebase)
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_status_check
  CHECK (status IN (
    'pending_ai_review',
    'pending_admin_review',
    'blocked',
    'approved',
    'rejected'
  ));

-- 2. amount must be a positive number
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_amount_positive
  CHECK (amount > 0);

-- 3. the client may not choose its own status
--    INSERT: non-privileged callers are forced to 'pending_ai_review'.
--    UPDATE: non-privileged callers may not change status at all.
--    service_role, admin and super_admin are unaffected.
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
  EXECUTE FUNCTION public.withdrawal_requests_guard_status();;
