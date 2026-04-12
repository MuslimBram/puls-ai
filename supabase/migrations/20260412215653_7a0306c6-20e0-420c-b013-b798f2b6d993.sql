
-- Drop any leftover policies from partial migration
DROP POLICY IF EXISTS "Users can view all locks" ON public.conversation_locks;
DROP POLICY IF EXISTS "Users can create locks" ON public.conversation_locks;
DROP POLICY IF EXISTS "Users can delete own locks" ON public.conversation_locks;
DROP POLICY IF EXISTS "Users can update own locks" ON public.conversation_locks;

-- Recreate proper policies
CREATE POLICY "Users can view all locks"
  ON public.conversation_locks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create locks"
  ON public.conversation_locks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = locked_by);

CREATE POLICY "Users can delete own locks"
  ON public.conversation_locks FOR DELETE
  TO authenticated
  USING (auth.uid() = locked_by);

CREATE POLICY "Users can update own locks"
  ON public.conversation_locks FOR UPDATE
  TO authenticated
  USING (auth.uid() = locked_by);

-- Fix functions missing search_path
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;

-- Fix generated-media storage
DROP POLICY IF EXISTS "Generated media is publicly accessible" ON storage.objects;

CREATE POLICY "Authenticated users can read own generated media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'generated-media'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
