-- Owner-only registration directory for platform oversight.
-- Keep this separate from business workspace data and expose only minimal identity metadata.
CREATE OR REPLACE FUNCTION public.platform_registration_directory()
RETURNS TABLE(
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email, u.created_at, u.last_sign_in_at
  FROM auth.users u
  WHERE public.has_role((SELECT auth.uid()), 'super_admin')
  ORDER BY u.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.platform_registration_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_registration_directory() TO authenticated, service_role;
