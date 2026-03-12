
-- Knowledge sources table: tracks each ingested source
CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'website',
  source_name text NOT NULL,
  source_url text,
  status text NOT NULL DEFAULT 'pending',
  last_scanned_at timestamp with time zone,
  scan_frequency text DEFAULT 'manual',
  is_enabled boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Knowledge chunks table: structured content pieces
CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_id uuid REFERENCES public.knowledge_sources(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  summary text,
  topic_tags text[] DEFAULT '{}'::text[],
  content_type text DEFAULT 'general',
  page_url text,
  page_title text,
  chunk_index integer DEFAULT 0,
  word_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_knowledge_sources_user_id ON public.knowledge_sources(user_id);
CREATE INDEX idx_knowledge_sources_status ON public.knowledge_sources(user_id, status);
CREATE INDEX idx_knowledge_chunks_user_id ON public.knowledge_chunks(user_id);
CREATE INDEX idx_knowledge_chunks_source_id ON public.knowledge_chunks(source_id);
CREATE INDEX idx_knowledge_chunks_topics ON public.knowledge_chunks USING GIN(topic_tags);

-- Enable RLS
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for knowledge_sources
CREATE POLICY "Users can view own knowledge_sources" ON public.knowledge_sources FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own knowledge_sources" ON public.knowledge_sources FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own knowledge_sources" ON public.knowledge_sources FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own knowledge_sources" ON public.knowledge_sources FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for knowledge_chunks
CREATE POLICY "Users can view own knowledge_chunks" ON public.knowledge_chunks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own knowledge_chunks" ON public.knowledge_chunks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own knowledge_chunks" ON public.knowledge_chunks FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own knowledge_chunks" ON public.knowledge_chunks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for document uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('knowledge-documents', 'knowledge-documents', false, 20971520);

-- Storage RLS: users can upload/read/delete their own files
CREATE POLICY "Users can upload knowledge documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knowledge-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can read own knowledge documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'knowledge-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete own knowledge documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'knowledge-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
