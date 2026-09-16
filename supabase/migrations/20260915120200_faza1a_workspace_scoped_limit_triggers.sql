-- FAZA 1A / M-2 + M-3 — workspace-scoped limits enforced in the database
--
-- STATUS: PREPARED, NOT APPLIED. Do not run without explicit owner approval.
--
-- ── Why a trigger and not just the edge function ─────────────────────────────
-- enforce-limits is invoked only by the frontend (useChannels.ts,
-- useKeywords.ts, TelegramSetup.tsx). Nothing obliges a client to call it, and
-- no RLS policy counts anything — every INSERT policy checks role only.
--
-- Production proof that this is not theoretical: on 2026-09-15 one account held
-- SIX channels against a Standard limit of THREE. The edge function reads the
-- limit correctly; it simply was not consulted.
--
-- ── Scope (owner decision V-4) ───────────────────────────────────────────────
-- PER WORKSPACE, because workspace is the unit of business in a multi-tenant
-- product. Deployed enforce-limits v52 counted channels per USER while the RLS
-- insert policy was per WORKSPACE — the two layers disagreed. Both now agree.
--
-- The governing plan is the subscription of workspaces.owner_id, resolved by
-- public.effective_plan_for_user() so the trigger and the edge function cannot
-- give different answers.
--
-- ── Deliberately INSERT-only ────────────────────────────────────────────────
-- These fire on INSERT, never on UPDATE or DELETE. Rows that already exceed a
-- limit are LEFT ALONE: the account with six channels keeps all six, and is
-- refused the seventh. Retroactive deletion would be destructive and is not
-- proposed.
--
-- Non-destructive: adds two functions and two triggers. No table, column or row
-- is dropped, altered or rewritten.

-- ── channels ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.channels_enforce_workspace_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner   uuid;
  v_plan    text;
  v_limit   integer;
  v_current integer;
BEGIN
  -- Platform staff and server-side work are not customer traffic.
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'channels.workspace_id is required for limit enforcement';
  END IF;

  SELECT owner_id INTO v_owner FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'workspace % does not exist', NEW.workspace_id;
  END IF;

  v_plan := public.effective_plan_for_user(v_owner);

  SELECT channels_limit INTO v_limit
  FROM public.pricing_settings WHERE plan_key = v_plan;

  -- Unknown plan key must not mean "unlimited".
  IF v_limit IS NULL THEN
    SELECT channels_limit INTO v_limit FROM public.pricing_settings WHERE plan_key = 'standard';
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current FROM public.channels WHERE workspace_id = NEW.workspace_id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Channel limit reached (%/%) for plan %. Upgrade to add more channels.',
      v_current, v_limit, v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_channels_enforce_workspace_limit ON public.channels;
CREATE TRIGGER trg_channels_enforce_workspace_limit
  BEFORE INSERT ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION public.channels_enforce_workspace_limit();

-- ── workspace_members ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workspace_members_enforce_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner   uuid;
  v_plan    text;
  v_limit   integer;
  v_current integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO v_owner FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'workspace % does not exist', NEW.workspace_id;
  END IF;

  -- The owner's own membership row is part of creating a workspace, not a seat
  -- purchase. Refusing it would make a Standard workspace uncreatable at
  -- limit 1.
  IF NEW.user_id = v_owner THEN
    RETURN NEW;
  END IF;

  v_plan := public.effective_plan_for_user(v_owner);

  SELECT team_members_limit INTO v_limit
  FROM public.pricing_settings WHERE plan_key = v_plan;

  IF v_limit IS NULL THEN
    SELECT team_members_limit INTO v_limit FROM public.pricing_settings WHERE plan_key = 'standard';
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current FROM public.workspace_members WHERE workspace_id = NEW.workspace_id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Team member limit reached (%/%) for plan %. Upgrade to add more members.',
      v_current, v_limit, v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_workspace_members_enforce_limit ON public.workspace_members;
CREATE TRIGGER trg_workspace_members_enforce_limit
  BEFORE INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_members_enforce_limit();
