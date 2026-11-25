
create or replace function public.create_business_workspace(
  _business_name text,
  _industry text default null,
  _short_description text default null
)
returns table(workspace_id uuid, business_id uuid)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  new_workspace_id uuid;
  new_business_id uuid;
begin
  if actor_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.user_roles
    where user_id = actor_id
      and role in ('admin', 'super_admin')
  ) then
    raise exception 'Only Owner or Admin can create businesses';
  end if;

  if _business_name is null or length(trim(_business_name)) < 2 or length(trim(_business_name)) > 120 then
    raise exception 'Business name must be between 2 and 120 characters';
  end if;

  insert into public.workspaces (name, owner_id)
  values (trim(_business_name), actor_id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, actor_id, 'owner');

  insert into public.business_profiles (
    user_id, workspace_id, business_name, industry, short_description
  )
  values (
    actor_id, new_workspace_id, trim(_business_name), nullif(trim(_industry), ''), nullif(trim(_short_description), '')
  )
  returning id into new_business_id;

  return query select new_workspace_id, new_business_id;
end;
$$;

revoke all on function public.create_business_workspace(text, text, text) from public;
grant execute on function public.create_business_workspace(text, text, text) to authenticated;
;
