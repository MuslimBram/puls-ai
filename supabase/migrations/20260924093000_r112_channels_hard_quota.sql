-- R112 P0 — hard channel quota across every creation path.
-- Standard=2, Professional=4, Advanced=8, Enterprise=-1 (unlimited).
-- INSERT only: existing legacy rows are not deleted.

CREATE OR REPLACE FUNCTION public.enforce_channels_workspace_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_plan text;
  v_limit integer;
  v_current integer;
  v_bypassed boolean := false;
BEGIN
  -- Platform staff and trusted service-role operations are not customer traffic.
  v_bypassed :=
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role);

  IF v_bypassed THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required for channel creation'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.workspaces
  WHERE id = NEW.workspace_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'workspace % does not exist', NEW.workspace_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_plan := public.effective_plan_for_user(v_owner);

  SELECT channels_limit INTO v_limit
  FROM public.pricing_settings
  WHERE plan_key = v_plan
    AND is_donation = false;

  -- Unknown/missing plan configuration must fail closed to Standard quota.
  IF v_limit IS NULL THEN
    SELECT channels_limit INTO v_limit
    FROM public.pricing_settings
    WHERE plan_key = 'standard'
      AND is_donation = false;
  END IF;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Channel quota configuration unavailable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current
  FROM public.channels
  WHERE workspace_id = NEW.workspace_id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Channel limit reached (%/%) for plan %. Upgrade to add more channels.',
      v_current, v_limit, v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_channels_workspace_quota ON public.channels;
CREATE TRIGGER trg_enforce_channels_workspace_quota
  BEFORE INSERT ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_channels_workspace_quota();
