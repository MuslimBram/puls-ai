
-- Call queues for routing inbound calls to available agents
CREATE TABLE public.call_queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'round_robin',
  max_wait_seconds INTEGER NOT NULL DEFAULT 300,
  wrap_up_seconds INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue members (which agents belong to which queue)
CREATE TABLE public.call_queue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.call_queues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  skills TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(queue_id, user_id)
);

-- Active calls (live call state tracking)
CREATE TABLE public.active_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  call_record_id UUID REFERENCES public.call_records(id),
  queue_id UUID REFERENCES public.call_queues(id),
  agent_user_id UUID,
  caller_number TEXT NOT NULL,
  caller_name TEXT,
  callee_number TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',
  status TEXT NOT NULL DEFAULT 'ringing',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  hold_started_at TIMESTAMPTZ,
  total_hold_seconds INTEGER DEFAULT 0,
  transfer_target TEXT,
  transferred_from UUID,
  sip_call_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent telephony state
CREATE TABLE public.agent_telephony_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  telephony_status TEXT NOT NULL DEFAULT 'offline',
  current_call_id UUID REFERENCES public.active_calls(id),
  last_call_ended_at TIMESTAMPTZ,
  calls_handled_today INTEGER DEFAULT 0,
  avg_handle_time_seconds INTEGER DEFAULT 0,
  sip_extension TEXT,
  sip_registered BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_queue_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_telephony_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view call queues in their workspace" ON public.call_queues
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage call queues" ON public.call_queues
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Members can view queue membership" ON public.call_queue_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.call_queues cq
    WHERE cq.id = queue_id AND public.is_workspace_member(auth.uid(), cq.workspace_id)
  ));

CREATE POLICY "Owners can manage queue membership" ON public.call_queue_members
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.call_queues cq
    WHERE cq.id = queue_id AND public.is_workspace_owner(auth.uid(), cq.workspace_id)
  ));

CREATE POLICY "Users can view active calls in their workspace" ON public.active_calls
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can manage their own active calls" ON public.active_calls
  FOR ALL TO authenticated
  USING (agent_user_id = auth.uid() OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Users can view their own telephony state" ON public.agent_telephony_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Users can manage their own telephony state" ON public.agent_telephony_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for active calls and agent state
ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_telephony_state;
