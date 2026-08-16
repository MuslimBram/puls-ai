-- Migration: 20260816214000_b8_storage_isolation.sql
-- B8 Storage V4 - Safe Path Parsing, Workspace Shared Knowledge Base & Strict Least Privilege

-- 1. Ensure buckets exist and enforce public = false
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('recordings', 'recordings', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('knowledge-documents', 'knowledge-documents', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = false;


-- 2. Preflight Check: Fail-safe guard against legacy objects without workspace folder
DO $$
DECLARE
  v_legacy_count integer;
BEGIN
  SELECT COUNT(*) INTO v_legacy_count
  FROM storage.objects
  WHERE bucket_id = 'knowledge-documents'
    AND (storage.foldername(name))[2] IS NULL;

  IF v_legacy_count > 0 THEN
    RAISE EXCEPTION 'Preflight failed: % legacy knowledge-documents object(s) found without workspace folder. Run backfill before applying strict RLS policies.', v_legacy_count;
  END IF;
END $$;


-- ============================================================================
-- 3. HARDENING 'knowledge-documents' BUCKET (Canonical Path: <uploader_user_id>/<workspace_id>/<filename>)
-- Replacing exact inventory policies: knowledge_select_auth, knowledge_insert_auth, knowledge_delete_auth
-- SELECT: Workspace shared (any member of workspace in folder 2 can read)
-- INSERT & DELETE: Uploader user (folder 1 = auth.uid()) AND workspace member
-- ============================================================================

DROP POLICY IF EXISTS "knowledge_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_delete_auth" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own knowledge documents" ON storage.objects;

-- SELECT: Shared across all workspace members
CREATE POLICY "knowledge_select_auth"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'knowledge-documents'
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- INSERT: Uploader owns folder 1 AND is a member of workspace in folder 2
CREATE POLICY "knowledge_insert_auth"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);

-- DELETE: Uploader owns folder 1 AND is a member of workspace in folder 2
CREATE POLICY "knowledge_delete_auth"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'knowledge-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.workspace_id::text = (storage.foldername(name))[2]
  )
);


-- ============================================================================
-- 4. HARDENING 'recordings' BUCKET (Canonical Path: <workspace_id>/<call_id>/<filename>)
-- Replacing exact inventory policy: recordings_select_auth
-- SELECT ONLY: authenticated workspace members can view/listen to call recordings
-- INSERT/UPDATE/DELETE handled exclusively by service_role via Edge Functions
-- ============================================================================

DROP POLICY IF EXISTS "recordings_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can view call recordings" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can upload call recordings" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can delete call recordings" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can update call recordings" ON storage.objects;

CREATE POLICY "recordings_select_auth"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'recordings'
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
    AND wm.workspace_id::text = (storage.foldername(name))[1]
  )
);
