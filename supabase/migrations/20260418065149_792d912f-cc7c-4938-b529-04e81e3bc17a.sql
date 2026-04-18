DROP POLICY IF EXISTS "Anyone can read pricing_settings" ON public.pricing_settings;
CREATE POLICY "Public can read public pricing_settings"
ON public.pricing_settings
FOR SELECT
TO anon, authenticated
USING (is_public = true);