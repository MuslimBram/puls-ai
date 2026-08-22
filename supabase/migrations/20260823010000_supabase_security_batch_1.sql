-- ============================================================
-- SUPABASE SECURITY HARDENING — BATCH 1
--
-- Scope is intentionally narrow:
--   1) pin search_path on the two mutable-path functions not already covered
--      by canonical B7 hardening;
--   2) remove public object-listing access from generated-media while
--      preserving the bucket's public delivery contract.
--
-- Canonical B7 migration 20260821121000 already hardens:
--   notify_admin_on_payment_submission()
--   verify_white_label_license(text)
--   validate_nba_against_rules(uuid,text,numeric,text,uuid)
--   evaluate_contact_policy(uuid,uuid,text,text)
-- Those warnings remain visible in production until B7 is rolled out.
--
-- SECURITY DEFINER EXECUTE grants are deliberately NOT changed here.
-- They require per-function RLS/trigger dependency triage in a separate batch.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Function Search Path Mutable — residual source gaps
-- ---------------------------------------------------------------------------
-- The live advisor reports these two functions, while they are not guaranteed
-- to exist in every candidate/reconstructed environment. Exact-signature guards
-- make replay safe without inventing function definitions.
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

-- ---------------------------------------------------------------------------
-- 2. generated-media: public delivery, private listing
-- ---------------------------------------------------------------------------
-- The generated-media bucket intentionally remains public because generated
-- assets are delivered through stable public URLs. Public delivery does not
-- require a blanket SELECT policy on storage.objects.
--
-- Remove known broad public-read/list policies, then restore the repository's
-- established user-folder listing rule for authenticated users. Service-role
-- writers continue to bypass RLS as before.
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
  'Prevents public enumeration of generated-media objects. Public object delivery remains controlled by the bucket public flag; authenticated listing is restricted to the caller user-id folder.';
