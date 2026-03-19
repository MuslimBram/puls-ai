
-- Call notes table
CREATE TABLE public.call_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_record_id UUID REFERENCES public.call_records(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call notes" ON public.call_notes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Call tags table
CREATE TABLE public.call_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_record_id UUID REFERENCES public.call_records(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.call_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own call tags" ON public.call_tags
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add lead_id column to call_records if not exists
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Add thread_id column to call_records for inbox integration
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL;

-- Enable realtime for call notes
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_tags;
