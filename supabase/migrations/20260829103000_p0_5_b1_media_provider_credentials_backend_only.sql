-- P0.5-B1: media provider credentials are a backend-only secret store.
-- Browser roles must never read or mutate encrypted_secret directly.

ALTER TABLE public.media_provider_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can insert media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can update media provider credentials" ON public.media_provider_credentials;
DROP POLICY IF EXISTS "Admins can delete media provider credentials" ON public.media_provider_credentials;

REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM sandbox_exec;

-- Edge Functions use service_role for the secret boundary. Keep only required DML.
REVOKE ALL PRIVILEGES ON TABLE public.media_provider_credentials FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.media_provider_credentials TO service_role;
