-- Trusted Public Lead Promotion
-- Routes public website leads to one server-controlled workspace and promotes
-- each capture to CRM exactly once. The environment-specific workspace UUID is
-- stored in public.internal_config under trusted_public_lead_workspace_id.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_public_lead_id uuid
  REFERENCES public.public_leads(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_source_public_lead_id_uidx
  ON public.leads(source_public_lead_id)
  WHERE source_public_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_trusted_public_lead_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT NULLIF(ic.value, '')::uuid
    INTO v_workspace_id
  FROM public.internal_config AS ic
  WHERE ic.key = 'trusted_public_lead_workspace_id';

  -- Never trust a caller-provided workspace. Only a configured, real,
  -- non-demo workspace can receive public leads.
  IF v_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS w
    WHERE w.id = v_workspace_id
      AND COALESCE(w.is_demo, false) = false
  ) THEN
    NEW.target_workspace_id := NULL;
    RETURN NEW;
  END IF;

  NEW.target_workspace_id := v_workspace_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_trusted_public_lead_workspace
  ON public.public_leads;

CREATE TRIGGER trg_assign_trusted_public_lead_workspace
BEFORE INSERT OR UPDATE OF target_workspace_id
ON public.public_leads
FOR EACH ROW
EXECUTE FUNCTION public.assign_trusted_public_lead_workspace();

CREATE OR REPLACE FUNCTION public.promote_trusted_public_lead_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF NEW.target_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.owner_id
    INTO v_owner_id
  FROM public.workspaces AS w
  WHERE w.id = NEW.target_workspace_id
    AND COALESCE(w.is_demo, false) = false;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.leads (
    user_id,
    workspace_id,
    source_public_lead_id,
    message_content,
    source_name,
    source_type,
    detected_keyword,
    intent_score,
    suggested_reply,
    status,
    intent_type,
    urgency_level,
    recommended_action,
    contact_identifier,
    channel_type,
    language
  )
  VALUES (
    v_owner_id,
    NEW.target_workspace_id,
    NEW.id,
    COALESCE(
      NULLIF(NEW.message, ''),
      'Public website enquiry from ' || NEW.name
    ),
    COALESCE(NULLIF(NEW.business_name, ''), NEW.name),
    'public_website',
    NULLIF(NEW.interested_plan, ''),
    NEW.ai_score,
    NEW.ai_notes,
    'new',
    COALESCE(NULLIF(NEW.ai_intent, ''), 'unknown'),
    CASE
      WHEN NEW.ai_score >= 0.70 THEN 'high'
      WHEN NEW.ai_score >= 0.40 THEN 'medium'
      ELSE 'low'
    END,
    'contact_lead',
    NEW.email,
    'web',
    NULL
  )
  ON CONFLICT (source_public_lead_id)
    WHERE source_public_lead_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_trusted_public_lead_to_crm
  ON public.public_leads;

CREATE TRIGGER trg_promote_trusted_public_lead_to_crm
AFTER INSERT
ON public.public_leads
FOR EACH ROW
EXECUTE FUNCTION public.promote_trusted_public_lead_to_crm();

REVOKE ALL ON FUNCTION public.assign_trusted_public_lead_workspace()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_trusted_public_lead_to_crm()
  FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.leads.source_public_lead_id IS
  'Idempotency link to the originating public website lead.';

COMMENT ON FUNCTION public.assign_trusted_public_lead_workspace() IS
  'Trigger-only: overwrites untrusted workspace input with the server-controlled workspace.';

COMMENT ON FUNCTION public.promote_trusted_public_lead_to_crm() IS
  'Trigger-only: promotes each trusted public lead into CRM exactly once.';
