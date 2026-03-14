
-- Add intent analysis columns to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS intent_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS urgency_level text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS recommended_action text NOT NULL DEFAULT 'monitor';

-- Add intent analysis columns to inbox_messages table
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS intent_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS urgency_level text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS recommended_action text NOT NULL DEFAULT 'monitor';
