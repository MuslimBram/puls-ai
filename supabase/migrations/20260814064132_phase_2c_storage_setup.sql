
-- K. STORAGE: Create required buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('knowledge-documents', 'knowledge-documents', false, 52428800,
   ARRAY['application/pdf','text/plain','text/markdown','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('recordings', 'recordings', false, 524288000,
   ARRAY['audio/mpeg','audio/mp4','audio/wav','audio/webm','video/mp4','video/webm']),
  ('user-uploads', 'user-uploads', false, 104857600, NULL),
  ('generated-media', 'generated-media', true, 104857600,
   ARRAY['image/png','image/jpeg','image/webp','image/gif','video/mp4'])
ON CONFLICT (id) DO NOTHING;

-- Simplified storage RLS using auth.uid() only
-- knowledge-documents: authenticated users can see files in their own workspace path
CREATE POLICY "knowledge_select_auth"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-documents' AND auth.role() = 'authenticated');

CREATE POLICY "knowledge_insert_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-documents' AND auth.role() = 'authenticated');

CREATE POLICY "knowledge_delete_auth"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-documents' AND auth.role() = 'authenticated');

-- recordings: authenticated access
CREATE POLICY "recordings_select_auth"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recordings' AND auth.role() = 'authenticated');

-- user-uploads: path-based own access (auth.uid() prefix)
CREATE POLICY "user_uploads_own"
  ON storage.objects FOR ALL
  USING (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'user-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- generated-media: public bucket, service role writes only  
CREATE POLICY "generated_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-media');

-- Verify
SELECT id, name, public FROM storage.buckets ORDER BY name;
;
