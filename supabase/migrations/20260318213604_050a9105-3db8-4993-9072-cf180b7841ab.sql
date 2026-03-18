-- Remove the dangerous anon INSERT policy that allows any user_id
DROP POLICY IF EXISTS "Public can insert ai_conversations" ON public.ai_conversations;