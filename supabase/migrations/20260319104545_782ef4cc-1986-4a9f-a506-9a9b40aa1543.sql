
-- Add external_call_id and recording_duration to call_records
ALTER TABLE public.call_records 
  ADD COLUMN IF NOT EXISTS external_call_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_duration INTEGER DEFAULT 0;

-- Create index on external_call_id for Twilio callback lookups
CREATE INDEX IF NOT EXISTS idx_call_records_external_call_id ON public.call_records(external_call_id);
CREATE INDEX IF NOT EXISTS idx_active_calls_sip_call_id ON public.active_calls(sip_call_id);

-- Fix RLS on agent_shifts: allow workspace members to view all shifts in workspace
DROP POLICY IF EXISTS "Users manage own shifts" ON public.agent_shifts;
CREATE POLICY "Users can manage own shifts"
  ON public.agent_shifts FOR ALL
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Workspace members can view shifts"
  ON public.agent_shifts FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Fix RLS on call_scripts: allow workspace members to view scripts
DROP POLICY IF EXISTS "Users manage own call scripts" ON public.call_scripts;
CREATE POLICY "Users can manage own scripts"
  ON public.call_scripts FOR ALL
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Workspace members can view scripts"
  ON public.call_scripts FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));

-- Create increment_usage_count function for call scripts
CREATE OR REPLACE FUNCTION public.increment_usage_count(_script_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.call_scripts
  SET usage_count = COALESCE(usage_count, 0) + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE id = _script_id;
END;
$$;

-- Add usage_count and last_used_at to call_scripts if missing
ALTER TABLE public.call_scripts
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
