-- Remove dangerous anon INSERT policy (allows inserting with any user_id)
DROP POLICY IF EXISTS "Public can insert ai_feedback" ON public.ai_feedback;

-- Remove anon SELECT policy (exposes all feedback to unauthenticated users)
DROP POLICY IF EXISTS "Public can view feedback by conversation" ON public.ai_feedback;