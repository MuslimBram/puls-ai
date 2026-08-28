do $$ begin
  create type public.workspace_access_role as enum ('business_admin','manager','employee','freelancer');
exception when duplicate_object then null; end $$;

create table if not exists public.workspace_access_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role public.workspace_access_role not null,
  assigned_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, user_id, access_role)
);

create index if not exists idx_workspace_access_assignments_user on public.workspace_access_assignments(user_id, is_active);
create index if not exists idx_workspace_access_assignments_workspace on public.workspace_access_assignments(workspace_id, is_active);

alter table public.workspace_access_assignments enable row level security;

create or replace function public.is_platform_operator(_user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user and ur.role in ('super_admin','admin')
  );
$$;

create or replace function public.has_workspace_access(_workspace uuid, _user uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_platform_operator(_user)
  or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace and wm.user_id = _user
  )
  or exists (
    select 1 from public.workspace_access_assignments waa
    where waa.workspace_id = _workspace and waa.user_id = _user and waa.is_active
  );
$$;

revoke all on function public.is_platform_operator(uuid) from public;
grant execute on function public.is_platform_operator(uuid) to authenticated, service_role;
revoke all on function public.has_workspace_access(uuid, uuid) from public;
grant execute on function public.has_workspace_access(uuid, uuid) to authenticated, service_role;

create policy "platform operators can manage workspace assignments"
on public.workspace_access_assignments for all to authenticated
using (public.is_platform_operator())
with check (public.is_platform_operator());

create policy "users can read their own workspace assignments"
on public.workspace_access_assignments for select to authenticated
using (user_id = auth.uid());

create or replace function public.prevent_platform_role_workspace_assignment()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_roles ur
    where ur.user_id = new.user_id and ur.role in ('super_admin','admin')
  ) then
    raise exception 'Platform Owner/Admin should not require a workspace access assignment';
  end if;
  if new.access_role = 'freelancer' and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = new.user_id and ur.role = 'freelancer'
  ) then
    raise exception 'User must hold the freelancer role before freelancer workspace access can be assigned';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_workspace_access_assignment on public.workspace_access_assignments;
create trigger trg_validate_workspace_access_assignment
before insert or update on public.workspace_access_assignments
for each row execute function public.prevent_platform_role_workspace_assignment();

create or replace function public.touch_workspace_access_assignments_updated_at()
returns trigger language plpgsql security invoker set search_path = public
as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_workspace_access_assignments_updated_at on public.workspace_access_assignments;
create trigger trg_workspace_access_assignments_updated_at
before update on public.workspace_access_assignments
for each row execute function public.touch_workspace_access_assignments_updated_at();

create policy "workspace data access helper policy placeholder"
on public.workspace_access_assignments for select to authenticated
using (public.is_platform_operator() or user_id = auth.uid());
