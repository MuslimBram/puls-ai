
-- ============================================================
-- CONVERSATION ENGINE UPGRADE: Enterprise Team Workflows
-- ============================================================

-- 1. SLA Configuration per workspace
CREATE TABLE public.sla_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  first_response_minutes INT NOT NULL DEFAULT 60,
  next_response_minutes INT NOT NULL DEFAULT 240,
  resolution_minutes INT NOT NULL DEFAULT 1440,
  business_hours_only BOOLEAN NOT NULL DEFAULT false,
  business_start_hour INT NOT NULL DEFAULT 9,
  business_end_hour INT NOT NULL DEFAULT 17,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.sla_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view SLA configs"
  ON public.sla_configs FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage SLA configs"
  ON public.sla_configs FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

-- 2. Conversation locks (reply collision detection)
CREATE TABLE public.conversation_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL,
  locked_by UUID NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes'),
  lock_type TEXT NOT NULL DEFAULT 'typing' CHECK (lock_type IN ('typing', 'replying')),
  UNIQUE(thread_id)
);

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage locks"
  ON public.conversation_locks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Auto-cleanup expired locks index
CREATE INDEX idx_conversation_locks_expires ON public.conversation_locks(expires_at);

-- 3. Team presence
CREATE TABLE public.team_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'idle', 'busy')),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_thread_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view presence"
  ON public.team_presence FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can update own presence"
  ON public.team_presence FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Agent assignment rules
CREATE TABLE public.assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'manual' CHECK (strategy IN ('manual', 'round_robin', 'load_based', 'fallback_admin')),
  max_open_per_agent INT NOT NULL DEFAULT 20,
  fallback_user_id UUID,
  last_assigned_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view assignment rules"
  ON public.assignment_rules FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage assignment rules"
  ON public.assignment_rules FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

-- 5. Conversation state machine columns on conversation_threads
ALTER TABLE public.conversation_threads
  ADD COLUMN IF NOT EXISTS next_response_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_due TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- 6. State machine enforcement function
CREATE OR REPLACE FUNCTION public.enforce_thread_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  valid_transition BOOLEAN := false;
BEGIN
  -- Skip if status didn't change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Define valid transitions
  CASE OLD.status
    WHEN 'new' THEN
      valid_transition := NEW.status IN ('open', 'pending', 'resolved', 'closed');
    WHEN 'open' THEN
      valid_transition := NEW.status IN ('pending', 'resolved', 'closed');
    WHEN 'pending' THEN
      valid_transition := NEW.status IN ('open', 'resolved', 'closed');
    WHEN 'resolved' THEN
      valid_transition := NEW.status IN ('open', 'closed');
    WHEN 'closed' THEN
      valid_transition := NEW.status IN ('open'); -- reopen only
    ELSE
      valid_transition := true; -- allow legacy statuses to transition
  END CASE;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid state transition from % to %', OLD.status, NEW.status;
  END IF;

  NEW.previous_status := OLD.status;
  NEW.state_changed_at := now();

  -- Set resolved_at
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' THEN
    NEW.resolved_at := now();
  END IF;

  -- Clear resolved_at on reopen
  IF NEW.status = 'open' AND OLD.status IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_thread_state_machine
  BEFORE UPDATE ON public.conversation_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_thread_state_machine();

-- 7. Auto-reopen on inbound message function
CREATE OR REPLACE FUNCTION public.auto_reopen_thread_on_inbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a new inbound message arrives, reopen resolved/closed threads
  IF NEW.direction = 'inbound' AND NEW.thread_id IS NOT NULL THEN
    UPDATE public.conversation_threads
    SET status = 'open', updated_at = now()
    WHERE id = NEW.thread_id
      AND status IN ('resolved', 'closed');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_reopen_on_inbound
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_reopen_thread_on_inbound();

-- 8. Cleanup expired locks function
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.conversation_locks WHERE expires_at < now();
$$;

-- 9. Round-robin assignment function
CREATE OR REPLACE FUNCTION public.assign_thread_round_robin(
  _workspace_id UUID,
  _thread_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _rule RECORD;
  _agents UUID[];
  _agent_id UUID;
  _next_idx INT;
  _open_count INT;
BEGIN
  SELECT * INTO _rule FROM public.assignment_rules WHERE workspace_id = _workspace_id;
  
  IF _rule IS NULL OR _rule.strategy = 'manual' THEN
    RETURN NULL;
  END IF;

  -- Get available agents (online or idle)
  SELECT ARRAY_AGG(tp.user_id ORDER BY tp.user_id)
  INTO _agents
  FROM public.team_presence tp
  WHERE tp.workspace_id = _workspace_id
    AND tp.status IN ('online', 'idle');

  IF _agents IS NULL OR array_length(_agents, 1) = 0 THEN
    -- Fallback to admin
    IF _rule.fallback_user_id IS NOT NULL THEN
      UPDATE public.conversation_threads SET assigned_to = _rule.fallback_user_id::text WHERE id = _thread_id;
      RETURN _rule.fallback_user_id;
    END IF;
    RETURN NULL;
  END IF;

  IF _rule.strategy = 'round_robin' THEN
    _next_idx := (_rule.last_assigned_index % array_length(_agents, 1)) + 1;
    _agent_id := _agents[_next_idx];
    UPDATE public.assignment_rules SET last_assigned_index = _next_idx, updated_at = now() WHERE id = _rule.id;
  
  ELSIF _rule.strategy = 'load_based' THEN
    -- Pick agent with fewest open conversations
    SELECT tp.user_id INTO _agent_id
    FROM public.team_presence tp
    WHERE tp.workspace_id = _workspace_id AND tp.status IN ('online', 'idle')
    ORDER BY (
      SELECT COUNT(*) FROM public.conversation_threads ct
      WHERE ct.assigned_to = tp.user_id::text
        AND ct.status IN ('new', 'open', 'pending')
    ) ASC
    LIMIT 1;
  END IF;

  -- Check max open limit
  IF _agent_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _open_count
    FROM public.conversation_threads
    WHERE assigned_to = _agent_id::text AND status IN ('new', 'open', 'pending');

    IF _open_count >= _rule.max_open_per_agent THEN
      IF _rule.fallback_user_id IS NOT NULL THEN
        _agent_id := _rule.fallback_user_id;
      ELSE
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  IF _agent_id IS NOT NULL THEN
    UPDATE public.conversation_threads SET assigned_to = _agent_id::text WHERE id = _thread_id;
  END IF;

  RETURN _agent_id;
END;
$$;

-- 10. SLA computation function
CREATE OR REPLACE FUNCTION public.compute_thread_sla(
  _thread_id UUID,
  _workspace_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sla RECORD;
  _thread RECORD;
BEGIN
  SELECT * INTO _sla FROM public.sla_configs WHERE workspace_id = _workspace_id;
  IF _sla IS NULL THEN RETURN; END IF;

  SELECT * INTO _thread FROM public.conversation_threads WHERE id = _thread_id;
  IF _thread IS NULL THEN RETURN; END IF;

  UPDATE public.conversation_threads SET
    sla_response_due = CASE
      WHEN first_response_at IS NULL THEN _thread.created_at + (_sla.first_response_minutes || ' minutes')::interval
      ELSE sla_response_due
    END,
    next_response_due = _thread.last_message_at + (_sla.next_response_minutes || ' minutes')::interval,
    resolution_due = _thread.created_at + (_sla.resolution_minutes || ' minutes')::interval,
    sla_breached = CASE
      WHEN first_response_at IS NULL AND now() > _thread.created_at + (_sla.first_response_minutes || ' minutes')::interval THEN true
      WHEN now() > _thread.created_at + (_sla.resolution_minutes || ' minutes')::interval AND status NOT IN ('resolved', 'closed') THEN true
      ELSE sla_breached
    END
  WHERE id = _thread_id;
END;
$$;

-- 11. Workload metrics view
CREATE OR REPLACE VIEW public.agent_workload_metrics AS
SELECT
  ct.assigned_to AS agent_id,
  ct.user_id,
  COUNT(*) FILTER (WHERE ct.status IN ('new', 'open', 'pending')) AS open_conversations,
  COUNT(*) FILTER (WHERE ct.status = 'resolved') AS resolved_today,
  COUNT(*) FILTER (WHERE ct.sla_breached = true AND ct.status NOT IN ('resolved', 'closed')) AS sla_breached_count,
  AVG(
    CASE WHEN ct.first_response_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ct.first_response_at - ct.created_at)) / 60.0
    ELSE NULL END
  )::INT AS avg_first_response_min,
  COUNT(*) FILTER (WHERE ct.status IN ('new') AND ct.assigned_to IS NULL) AS unassigned_queue
FROM public.conversation_threads ct
WHERE ct.assigned_to IS NOT NULL
GROUP BY ct.assigned_to, ct.user_id;

-- Enable realtime for presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_locks;
