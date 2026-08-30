create table if not exists public.role_definitions (
  role public.app_role primary key,
  display_name text not null,
  scope text not null check (scope in ('platform','business','partner')),
  description text not null,
  can_manage_platform boolean not null default false,
  can_view_all_workspaces boolean not null default false,
  requires_workspace_assignment boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.role_definitions(role, display_name, scope, description, can_manage_platform, can_view_all_workspaces, requires_workspace_assignment)
values
  ('super_admin','Owner','platform','Full Pulse AI platform access.',true,true,false),
  ('admin','Pulse AI Admin','platform','Platform operations, business oversight and sensitive approvals; cannot create another Pulse AI Admin.',true,true,false),
  ('business_owner','Business Admin','business','Full operational administration of the assigned business workspace.',false,false,true),
  ('freelancer','Freelancer','partner','Manages assigned business clients and eligible partner services.',false,false,true),
  ('ambassador','Ambassador','partner','Referral and ambassador activities with tracked attribution and rewards.',false,false,false),
  ('white_label','White-Label','partner','White-label partner account for a client portfolio, branding and reseller operations.',false,false,false)
on conflict (role) do update set
  display_name=excluded.display_name,
  scope=excluded.scope,
  description=excluded.description,
  can_manage_platform=excluded.can_manage_platform,
  can_view_all_workspaces=excluded.can_view_all_workspaces,
  requires_workspace_assignment=excluded.requires_workspace_assignment,
  is_active=true,
  updated_at=now();

alter table public.role_definitions enable row level security;
drop policy if exists role_definitions_read_authenticated on public.role_definitions;
create policy role_definitions_read_authenticated on public.role_definitions for select to authenticated using (is_active = true);

drop policy if exists role_definitions_manage_owner on public.role_definitions;
create policy role_definitions_manage_owner on public.role_definitions for all to authenticated using (public.has_role(auth.uid(),'super_admin'::public.app_role)) with check (public.has_role(auth.uid(),'super_admin'::public.app_role));
