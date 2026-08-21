-- Migration: 20260821122000_b8_storage_isolation.sql
-- B8 Storage Isolation — Workspace Shared Knowledge Base & Strict Least Privilege
-- Ported from PR #7 (superseded source: integration/b7-b8-source-hardening).
--
-- Changes vs main:
--   Main has legacy per-user policies (foldername[1]=auth.uid()) for knowledge-documents.
--   This migration replaces them with workspace-aware policies and adds recordings bucket policy.
--
-- Safe text path parsing: no ::uuid cast on storage.foldername(name).
-- Preflight guard: migration self-aborts if legacy objects without workspace folder exist.
--
-- SOURCE/CANONICAL SECURITY HARDENING ONLY.
-- DO NOT APPLY TO PRODUCTION DATABASE YET.
-- Production DB rollout remains blocked pending migration baseline/history reconciliation.

-- ============================================================================
-- 1. Ensure buckets exist and enforce public = false
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('recordings', 'recordings', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('knowledge-documents', 'knowledge-documents', false, 20971520)
ON CONFLICT (id) DO UPDATE SET public = false;


-- ============================================================================
-- 2. Preflight Check: fail-safe guard against legacy objects without workspace folder
--    Migration self-aborts safely — run object backfill before applying if needed.
-- ============================================================================

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
-- 3. knowledge-documents BUCKET (canonical path: <uploader_uid>/<workspace_id>/<filename>)
--    SELECT: workspace-shared (any workspace member can read)
--    INSERT/DELETE: uploader owns folder 1 AND is a workspace member
-- ============================================================================

DROP POLICY IF EXISTS "knowledge_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_delete_auth" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own knowledge documents" ON storage.objects;

-- SELECT: any workspace member can read (workspace Knowledge Base sharing)
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

-- INSERT: uploader owns folder 1 AND is a workspace member
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

-- DELETE: uploader owns folder 1 AND is a workspace member
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
-- 4. recordings BUCKET (canonical path: <workspace_id>/<call_id>/<filename>)
--    SELECT ONLY for authenticated workspace members.
--    INSERT/UPDATE/DELETE handled exclusively by service_role via Edge Functions.
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
