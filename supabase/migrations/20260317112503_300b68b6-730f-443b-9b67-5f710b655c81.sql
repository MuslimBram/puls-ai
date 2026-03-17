-- Add quota limits to workspace_storage_quotas
ALTER TABLE public.workspace_storage_quotas 
  ADD COLUMN IF NOT EXISTS max_messages INT NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS max_documents INT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_media_mb INT NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS documents_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_size_mb NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_quota_exceeded BOOLEAN NOT NULL DEFAULT false;

-- Function to check if workspace is within quota
CREATE OR REPLACE FUNCTION public.check_storage_quota(_workspace_id UUID, _resource_type TEXT DEFAULT 'messages')
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _quota RECORD;
BEGIN
  SELECT * INTO _quota FROM public.workspace_storage_quotas WHERE workspace_id = _workspace_id;
  
  IF _quota IS NULL THEN RETURN true; END IF;

  CASE _resource_type
    WHEN 'messages' THEN
      RETURN _quota.messages_count < _quota.max_messages;
    WHEN 'documents' THEN
      RETURN _quota.documents_count < _quota.max_documents;
    WHEN 'media' THEN
      RETURN _quota.media_size_mb < _quota.max_media_mb;
    ELSE
      RETURN true;
  END CASE;
END;
$$;

-- Trigger to auto-flag quota exceeded
CREATE OR REPLACE FUNCTION public.update_quota_exceeded_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.is_quota_exceeded := (
    NEW.messages_count >= NEW.max_messages OR
    NEW.documents_count >= NEW.max_documents OR
    NEW.media_size_mb >= NEW.max_media_mb
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quota_exceeded_flag
BEFORE INSERT OR UPDATE ON public.workspace_storage_quotas
FOR EACH ROW EXECUTE FUNCTION public.update_quota_exceeded_flag();
