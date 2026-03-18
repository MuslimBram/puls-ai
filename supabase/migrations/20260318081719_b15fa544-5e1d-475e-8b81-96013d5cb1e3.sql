CREATE TABLE IF NOT EXISTS public.media_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key TEXT NOT NULL UNIQUE,
  credential_type TEXT NOT NULL DEFAULT 'api_key',
  credential_label TEXT,
  encrypted_secret TEXT NOT NULL,
  secret_hint TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  last_validated_at TIMESTAMPTZ,
  last_validation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.media_provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view media provider credentials" ON public.media_provider_credentials;
CREATE POLICY "Admins can view media provider credentials"
ON public.media_provider_credentials
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert media provider credentials" ON public.media_provider_credentials;
CREATE POLICY "Admins can insert media provider credentials"
ON public.media_provider_credentials
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update media provider credentials" ON public.media_provider_credentials;
CREATE POLICY "Admins can update media provider credentials"
ON public.media_provider_credentials
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete media provider credentials" ON public.media_provider_credentials;
CREATE POLICY "Admins can delete media provider credentials"
ON public.media_provider_credentials
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_media_provider_credentials_provider_key
ON public.media_provider_credentials(provider_key);

DROP TRIGGER IF EXISTS update_media_provider_credentials_updated_at ON public.media_provider_credentials;
CREATE TRIGGER update_media_provider_credentials_updated_at
BEFORE UPDATE ON public.media_provider_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();