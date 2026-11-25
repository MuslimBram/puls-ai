CREATE OR REPLACE FUNCTION public.platform_business_directory()
RETURNS TABLE(id uuid, workspace_id uuid, business_name text, industry text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT bp.id, bp.workspace_id, bp.business_name, bp.industry, bp.created_at
  FROM public.business_profiles bp
  WHERE public.has_role((SELECT auth.uid()), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.workspace_access_assignments waa
      WHERE waa.workspace_id = bp.workspace_id AND waa.user_id = (SELECT auth.uid())
        AND waa.is_active = true AND (waa.expires_at IS NULL OR waa.expires_at > now())
    )
  ORDER BY bp.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.platform_business_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_business_directory() TO authenticated, service_role;;
