-- FAZA 2 — quota enforcement in the database: leads / month, automation rules
--
-- STATUS: PREPARED. Applied to production only as part of the Faza 2 Big Step
-- (precedent 1C-4 / 1A: this header is not rewritten after apply; the report
-- records the production version stamp).
--
-- ── What this adds ───────────────────────────────────────────────────────────
--  1. public.leads_used_this_month(workspace)
--     ONE implementation of the period rule ("leads / month" = rows created
--     since the start of the current calendar month, UTC). It is called by the
--     trigger below, by enforce-limits (resource=leads) and by the frontend
--     usage bar over RPC, so the three cannot disagree about the number.
--     SECURITY INVOKER: over the API it runs under the caller's RLS (a
--     workspace member sees the workspace's rows); inside the trigger it runs
--     as the trigger's definer.
--  2. trg_leads_enforce_monthly_limit               BEFORE INSERT ON leads
--  3. trg_automation_workflows_enforce_workspace_limit
--                                                   BEFORE INSERT ON automation_workflows
--
-- ── Why triggers ─────────────────────────────────────────────────────────────
-- leads are written by nine server-side functions (email-poll, sms-webhook,
-- webchat-ingest, webhook-ingest, telegram-webhook, meta-webhook,
-- whatsapp-webhook, public-api, mcp) and none of them consults enforce-limits.
-- One trigger covers all nine and any writer added later. Automation rules are
-- written by the frontend (which now calls enforce-limits first) and by
-- install-industry-pack (service role, no check): the trigger is the second
-- layer for the first and the only layer for the second.
--
-- ── Scope ────────────────────────────────────────────────────────────────────
-- PER WORKSPACE. leads.workspace_id and automation_workflows.workspace_id are
-- the unit; the governing plan is the subscription of workspaces.owner_id,
-- resolved by public.effective_plan_for_user() — the same function the Faza 1A
-- triggers use, so no second copy of the downgrade rules exists.
--
-- ── Bypass rule ──────────────────────────────────────────────────────────────
-- Platform staff only: the acting user (auth.uid()) holds admin/super_admin,
-- OR the workspace owner does. There is deliberately NO service_role bypass:
-- every writer of leads runs with the service key, so a service_role bypass
-- here would enforce nothing. (The Faza 1A triggers carry one because their
-- writers are RLS-path clients; they are not changed by this file.)
--
-- ── What is NOT used ─────────────────────────────────────────────────────────
-- subscriptions.leads_used and billing_cycle_start. The counter was
-- incremented by one writer out of nine and reset_monthly_usage() is scheduled
-- by no cron job, so it is neither complete nor periodic.
--
-- ── Deliberately INSERT-only ────────────────────────────────────────────────
-- Rows already over a limit are left alone; nothing is deleted or rewritten.
-- Non-destructive: adds one SQL function, two trigger functions, two triggers.

-- ── 1. the period rule ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_used_this_month(_workspace_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
  FROM public.leads l
  WHERE l.workspace_id = _workspace_id
    AND l.created_at >= (date_trunc('month', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc');
$function$;

COMMENT ON FUNCTION public.leads_used_this_month(uuid) IS
  'FAZA 2: leads created in the current calendar month (UTC) for one workspace. The single implementation behind the leads trigger, enforce-limits resource=leads and the usage bar.';

REVOKE ALL ON FUNCTION public.leads_used_this_month(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_used_this_month(uuid) TO authenticated, service_role;

-- ── 2. leads / month ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_enforce_monthly_limit()
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
  -- A lead that belongs to no workspace cannot be counted against any plan.
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'leads.workspace_id is required for limit enforcement';
  END IF;

  SELECT owner_id INTO v_owner FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'workspace % does not exist', NEW.workspace_id;
  END IF;

  -- Platform staff are not customer traffic: the acting user, or the owner.
  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)
     OR has_role(v_owner, 'admin'::app_role)
     OR has_role(v_owner, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  v_plan := public.effective_plan_for_user(v_owner);

  SELECT leads_per_month_limit INTO v_limit
  FROM public.pricing_settings WHERE plan_key = v_plan;

  -- Unknown plan key must not mean "unlimited".
  IF v_limit IS NULL THEN
    SELECT leads_per_month_limit INTO v_limit FROM public.pricing_settings WHERE plan_key = 'standard';
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  v_current := public.leads_used_this_month(NEW.workspace_id);

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Monthly lead limit reached (%/%) for plan %. Upgrade for more leads.',
      v_current, v_limit, v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_leads_enforce_monthly_limit ON public.leads;
CREATE TRIGGER trg_leads_enforce_monthly_limit
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_enforce_monthly_limit();

-- ── 3. automation rules ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.automation_workflows_enforce_workspace_limit()
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
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'automation_workflows.workspace_id is required for limit enforcement';
  END IF;

  SELECT owner_id INTO v_owner FROM public.workspaces WHERE id = NEW.workspace_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'workspace % does not exist', NEW.workspace_id;
  END IF;

  IF has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)
     OR has_role(v_owner, 'admin'::app_role)
     OR has_role(v_owner, 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  v_plan := public.effective_plan_for_user(v_owner);

  SELECT automation_rules_limit INTO v_limit
  FROM public.pricing_settings WHERE plan_key = v_plan;

  IF v_limit IS NULL THEN
    SELECT automation_rules_limit INTO v_limit FROM public.pricing_settings WHERE plan_key = 'standard';
  END IF;

  IF v_limit IS NULL OR v_limit = -1 THEN
    RETURN NEW;
  END IF;

  -- Every rule counts, active or not: a slot is a slot.
  SELECT count(*) INTO v_current FROM public.automation_workflows WHERE workspace_id = NEW.workspace_id;

  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Automation rule limit reached (%/%) for plan %. Upgrade to add more automation rules.',
      v_current, v_limit, v_plan
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_automation_workflows_enforce_workspace_limit ON public.automation_workflows;
CREATE TRIGGER trg_automation_workflows_enforce_workspace_limit
  BEFORE INSERT ON public.automation_workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.automation_workflows_enforce_workspace_limit();;
