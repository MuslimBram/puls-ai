
-- AI conversations table to track visitor interactions
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_type text NOT NULL DEFAULT 'website_chat',
  visitor_name text,
  visitor_email text,
  visitor_message text NOT NULL,
  ai_reply text,
  is_auto_reply boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  complexity text NOT NULL DEFAULT 'simple',
  status text NOT NULL DEFAULT 'pending',
  page_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_conversations" ON public.ai_conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai_conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai_conversations" ON public.ai_conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Public can insert ai_conversations" ON public.ai_conversations FOR INSERT TO anon WITH CHECK (true);

-- AI feedback table for visitor ratings
CREATE TABLE public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  rating integer,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai_feedback" ON public.ai_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai_feedback" ON public.ai_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public can insert ai_feedback" ON public.ai_feedback FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Public can view feedback by conversation" ON public.ai_feedback FOR SELECT TO anon USING (true);

-- Enable realtime for ai_conversations
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversations;
