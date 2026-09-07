-- Private workspace-scoped storage for LEAH attachments.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leah-attachments',
  'leah-attachments',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/json',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "LEAH attachments are readable in workspace" ON storage.objects;
CREATE POLICY "LEAH attachments are readable in workspace"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leah-attachments'
  AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "LEAH attachments are uploaded in workspace" ON storage.objects;
CREATE POLICY "LEAH attachments are uploaded in workspace"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'leah-attachments'
  AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[1] IS NOT NULL
);

DROP POLICY IF EXISTS "LEAH attachments are removed in workspace" ON storage.objects;
CREATE POLICY "LEAH attachments are removed in workspace"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'leah-attachments'
  AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
);
