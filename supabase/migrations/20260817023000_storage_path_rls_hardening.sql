-- Migration: 20260817023000_storage_path_rls_hardening.sql
-- Hardens LIVE storage buckets (knowledge-documents, recordings) and strips legacy permissive policies

-- 1. Ensure LIVE private buckets exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-documents', 'knowledge-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO UPDATE SET public = false;
-- 2. Explicitly remove legacy permissive policies identified by auditor
DROP POLICY IF EXISTS "knowledge_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_insert_auth" ON storage.objects;
DROP POLICY IF EXISTS "knowledge_delete_auth" ON storage.objects;
DROP POLICY IF EXISTS "recordings_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own knowledge documents" ON storage.objects;
DROP POLICY IF EXISTS "Knowledge bucket user isolation" ON storage.objects;
DROP POLICY IF EXISTS "Knowledge documents isolation" ON storage.objects;
DROP POLICY IF EXISTS "Recordings bucket workspace isolation" ON storage.objects;
-- 3. Scoped policy for knowledge-documents: <uploader_user_id>/<workspace_id>/<filename>
CREATE POLICY "Knowledge documents isolation" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'knowledge-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
)
WITH CHECK (
  bucket_id = 'knowledge-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[2])::uuid)
);
-- 4. Scoped policy for recordings: <workspace_id>/<call_id>/<filename>
CREATE POLICY "Recordings bucket workspace isolation" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'recordings'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'recordings'
  AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
