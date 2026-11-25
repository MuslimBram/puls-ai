DO $$
BEGIN
  IF to_regprocedure('public.generate_payment_reference()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.generate_payment_reference() SET search_path = public, pg_temp';
  END IF;
  IF to_regprocedure('public.set_payment_reference()') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.set_payment_reference() SET search_path = public, pg_temp';
  END IF;
END
$$;

DROP POLICY IF EXISTS generated_media_public_read ON storage.objects;
DROP POLICY IF EXISTS "Generated media is publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read own generated media" ON storage.objects;

CREATE POLICY "Authenticated users can read own generated media"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'generated-media'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

COMMENT ON POLICY "Authenticated users can read own generated media" ON storage.objects IS
  'Prevents public enumeration of generated-media objects. Public object delivery remains controlled by the bucket public flag; authenticated listing is restricted to the caller user-id folder.';;
