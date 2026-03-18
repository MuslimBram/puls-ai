-- Tighten media_usage_policy SELECT to avoid permissive RLS lint
DROP POLICY IF EXISTS "Anyone can read media usage policy" ON public.media_usage_policy;

CREATE POLICY "Authenticated users can read media usage policy"
ON public.media_usage_policy
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);