
-- Call scripts and macros
CREATE TABLE public.call_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  script_type TEXT NOT NULL DEFAULT 'script', -- 'script' | 'macro' | 'objection_handler'
  content JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of steps: {type, text, options}
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own call scripts" ON public.call_scripts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Agent shifts for workforce management
CREATE TABLE public.agent_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  agent_user_id UUID NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT DEFAULT 0,
  status TEXT DEFAULT 'scheduled', -- scheduled | active | completed | absent
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own shifts" ON public.agent_shifts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_scripts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_shifts;
