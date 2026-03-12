
-- Content knowledge base for scanned business data
CREATE TABLE public.content_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'website',
  source_url text,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.content_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content_knowledge" ON public.content_knowledge FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content_knowledge" ON public.content_knowledge FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content_knowledge" ON public.content_knowledge FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content_knowledge" ON public.content_knowledge FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_content_knowledge_user_id ON public.content_knowledge(user_id);

-- Content posts table
CREATE TABLE public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  caption text NOT NULL,
  hashtags text[] DEFAULT '{}'::text[],
  cta text,
  media_type text NOT NULL DEFAULT 'image',
  content_type text NOT NULL DEFAULT 'promotional',
  target_networks text[] DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamp with time zone,
  approved_at timestamp with time zone,
  published_at timestamp with time zone,
  engagement_metrics jsonb DEFAULT '{}'::jsonb,
  ai_generated boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content_posts" ON public.content_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content_posts" ON public.content_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content_posts" ON public.content_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content_posts" ON public.content_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_content_posts_user_id_scheduled ON public.content_posts(user_id, scheduled_at);
CREATE INDEX idx_content_posts_user_id_status ON public.content_posts(user_id, status);

-- Content ideas table
CREATE TABLE public.content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idea_text text NOT NULL,
  content_type text NOT NULL DEFAULT 'promotional',
  suggested_media text DEFAULT 'image',
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content_ideas" ON public.content_ideas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content_ideas" ON public.content_ideas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content_ideas" ON public.content_ideas FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content_ideas" ON public.content_ideas FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_content_ideas_user_id ON public.content_ideas(user_id);
