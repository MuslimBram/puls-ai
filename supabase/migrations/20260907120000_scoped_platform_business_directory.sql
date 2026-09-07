-- Platform Owner/Admin business directory
-- Exposes only non-sensitive business metadata for the dashboard.
-- Private business data remains workspace/session scoped.
create or replace function public.platform_business_directory()
returns table (
  id uuid,
  workspace_id uuid,
  business_name text,
  industry text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bp.id,
    bp.workspace_id,
    bp.business_name,
    bp.industry,
    bp.created_at
  from public.business_profiles bp
  where public.is_platform_operator()
    and bp.workspace_id is not null
  order by bp.created_at desc;
$$;

revoke all on function public.platform_business_directory() from public, anon;
grant execute on function public.platform_business_directory() to authenticated, service_role;

-- Do not expose full business profiles to platform roles through a broad table policy.
drop policy if exists "Platform admins can view all business profiles" on public.business_profiles;
