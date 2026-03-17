-- Escalation rules table
CREATE TABLE public.escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default Escalation',
  trigger_type TEXT NOT NULL DEFAULT 'sla_breach', -- sla_breach, no_response, unassigned
  trigger_minutes INT NOT NULL DEFAULT 30,
  action_type TEXT NOT NULL DEFAULT 'reassign', -- reassign, notify, escalate_to_admin
  escalate_to_user_id UUID, -- specific user to escalate to
  notify_channel TEXT DEFAULT 'in_app', -- in_app, email, both
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view escalation rules"
  ON public.escalation_rules FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage escalation rules"
  ON public.escalation_rules FOR ALL
  USING (public.is_workspace_owner(auth.uid(), workspace_id));

-- Escalation log for audit
CREATE TABLE public.escalation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE CASCADE NOT NULL,
  rule_id UUID REFERENCES public.escalation_rules(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  previous_agent TEXT,
  escalated_to TEXT,
  reason TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view escalation logs"
  ON public.escalation_log FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Function: process escalations for a workspace
CREATE OR REPLACE FUNCTION public.process_escalations(_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rule RECORD;
  _thread RECORD;
  _escalated INT := 0;
  _reassigned INT := 0;
  _notified INT := 0;
  _fallback_admin UUID;
BEGIN
  -- Get workspace owner as ultimate fallback
  SELECT owner_id INTO _fallback_admin FROM public.workspaces WHERE id = _workspace_id;

  FOR _rule IN
    SELECT * FROM public.escalation_rules
    WHERE workspace_id = _workspace_id AND is_active = true
    ORDER BY priority ASC
  LOOP
    -- Find threads matching this rule's trigger
    FOR _thread IN
      SELECT ct.* FROM public.conversation_threads ct
      WHERE ct.status IN ('new', 'open', 'pending')
        AND ct.user_id IN (SELECT owner_id FROM public.workspaces WHERE id = _workspace_id)
        AND (
          (_rule.trigger_type = 'sla_breach' AND ct.sla_breached = true)
          OR (_rule.trigger_type = 'no_response' AND ct.first_response_at IS NULL
              AND ct.created_at < now() - (_rule.trigger_minutes || ' minutes')::interval)
          OR (_rule.trigger_type = 'unassigned' AND ct.assigned_to IS NULL
              AND ct.created_at < now() - (_rule.trigger_minutes || ' minutes')::interval)
        )
      LIMIT 50
    LOOP
      -- Execute action
      IF _rule.action_type = 'reassign' THEN
        UPDATE public.conversation_threads
        SET assigned_to = COALESCE(_rule.escalate_to_user_id::text, _fallback_admin::text),
            updated_at = now()
        WHERE id = _thread.id;
        _reassigned := _reassigned + 1;

      ELSIF _rule.action_type = 'escalate_to_admin' THEN
        UPDATE public.conversation_threads
        SET assigned_to = _fallback_admin::text, updated_at = now()
        WHERE id = _thread.id;
        _escalated := _escalated + 1;
      END IF;

      -- Always notify
      INSERT INTO public.business_notifications (
        user_id, title, message, notification_type, category, action_url
      ) VALUES (
        COALESCE(_rule.escalate_to_user_id, _fallback_admin),
        '🔺 Escalation: ' || _rule.name,
        'Thread ' || LEFT(_thread.id::text, 8) || ' escalated due to ' || _rule.trigger_type,
        'system', 'alert', '/helpdesk'
      );
      _notified := _notified + 1;

      -- Log it
      INSERT INTO public.escalation_log (thread_id, rule_id, workspace_id, previous_agent, escalated_to, reason, action_taken)
      VALUES (
        _thread.id, _rule.id, _workspace_id,
        _thread.assigned_to,
        COALESCE(_rule.escalate_to_user_id::text, _fallback_admin::text),
        _rule.trigger_type,
        _rule.action_type
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('escalated', _escalated, 'reassigned', _reassigned, 'notified', _notified);
END;
$$;
