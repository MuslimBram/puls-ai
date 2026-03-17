
-- Create storage bucket for generated media
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-media', 'generated-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload generated media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'generated-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access (images are served publicly)
CREATE POLICY "Generated media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-media');

-- Allow users to delete their own generated media
CREATE POLICY "Users can delete own generated media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'generated-media' AND auth.uid()::text = (storage.foldername(name))[1]);
