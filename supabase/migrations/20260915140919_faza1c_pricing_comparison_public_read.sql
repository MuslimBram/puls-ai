DROP POLICY IF EXISTS "Public can view active pricing feature sections" ON public.pricing_feature_sections;
CREATE POLICY "Public can view active pricing feature sections"
  ON public.pricing_feature_sections
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Public can view pricing feature rows" ON public.pricing_feature_rows;
CREATE POLICY "Public can view pricing feature rows"
  ON public.pricing_feature_rows
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pricing_feature_sections s
      WHERE s.id = pricing_feature_rows.section_id
        AND s.is_active = true
    )
  );;
