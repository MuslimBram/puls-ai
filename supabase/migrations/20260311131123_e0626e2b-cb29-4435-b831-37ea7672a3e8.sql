
-- Fix security: enable RLS on channel_registry with public read
ALTER TABLE public.channel_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read channel registry" ON public.channel_registry FOR SELECT TO authenticated USING (true);

-- Remove overly permissive anon policies  
DROP POLICY IF EXISTS "Service can insert inbox messages" ON public.inbox_messages;
DROP POLICY IF EXISTS "Service can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Service can insert inbox" ON public.inbox_messages;
