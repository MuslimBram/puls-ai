-- Storage hardening: generated media privacy + canonical recording workspace access.
DO $$
DECLARE
  _public boolean;
  _objects bigint;
BEGIN
  SELECT public INTO _public FROM storage.buckets WHERE id='generated-media';
  IF _public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'storage guard: generated-media public flag drift';
  END IF;
  SELECT count(*) INTO _objects FROM storage.objects WHERE bucket_id='generated-media';
  IF _objects<>0 THEN
    RAISE EXCEPTION 'storage guard: generated-media gained % objects; review public->private migration first',_objects;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='recordings' AND public=false) THEN
    RAISE EXCEPTION 'storage guard: private recordings bucket missing/drifted';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Recordings bucket workspace isolation') THEN
    RAISE EXCEPTION 'storage guard: recordings policy missing/drifted';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='user_uploads_own') THEN
    RAISE EXCEPTION 'storage guard: user uploads policy missing/drifted';
  END IF;
END $$;

UPDATE storage.buckets SET public=false WHERE id='generated-media';

DROP POLICY IF EXISTS "Recordings bucket workspace isolation" ON storage.objects;
CREATE POLICY "Recordings bucket workspace isolation"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id='recordings'
  AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id='recordings'
  AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
);

-- PUBLIC here was logically auth-bound by auth.uid(), but make the role boundary
-- explicit so anonymous sessions never participate in policy evaluation.
DROP POLICY IF EXISTS "user_uploads_own" ON storage.objects;
CREATE POLICY "user_uploads_own"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id='user-uploads'
  AND (auth.uid())::text=(storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id='user-uploads'
  AND (auth.uid())::text=(storage.foldername(name))[1]
);

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='generated-media' AND public) THEN
    RAISE EXCEPTION 'storage certification: generated-media remains public';
  END IF;
  IF EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='user_uploads_own'
      AND 'public'=ANY(roles)
  ) THEN
    RAISE EXCEPTION 'storage certification: user_uploads_own still applies to public role';
  END IF;
END $$;
