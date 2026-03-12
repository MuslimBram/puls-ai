
-- Visitor profiles for intent scoring
CREATE TABLE public.visitor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  visitor_identifier TEXT NOT NULL,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  classification TEXT NOT NULL DEFAULT 'curious_visitor',
  intent_score NUMERIC DEFAULT 0,
  total_visits INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  total_conversations INTEGER DEFAULT 0,
  total_pages_viewed INTEGER DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  lead_id UUID REFERENCES public.leads(id),
  deal_id UUID REFERENCES public.deals(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visitor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visitor_profiles" ON public.visitor_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own visitor_profiles" ON public.visitor_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own visitor_profiles" ON public.visitor_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own visitor_profiles" ON public.visitor_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Visitor events for timeline
CREATE TABLE public.visitor_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  visitor_id UUID REFERENCES public.visitor_profiles(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'page_view',
  event_title TEXT,
  event_description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.visitor_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visitor_events" ON public.visitor_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own visitor_events" ON public.visitor_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own visitor_events" ON public.visitor_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Re-engagement queue
CREATE TABLE public.reengagement_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  visitor_id UUID REFERENCES public.visitor_profiles(id) ON DELETE CASCADE NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'follow_up',
  channel TEXT NOT NULL DEFAULT 'email',
  suggested_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reengagement_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reengagement_tasks" ON public.reengagement_tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reengagement_tasks" ON public.reengagement_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reengagement_tasks" ON public.reengagement_tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reengagement_tasks" ON public.reengagement_tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);
