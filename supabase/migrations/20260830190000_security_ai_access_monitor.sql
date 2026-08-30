begin;

create table if not exists public.security_access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event_type text not null,
  ip_address inet,
  user_agent text,
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  risk_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_access_events_user_time_idx
  on public.security_access_events(user_id, created_at desc);
create index if not exists security_access_events_workspace_time_idx
  on public.security_access_events(workspace_id, created_at desc);

create table if not exists public.security_presence (
  user_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  session_id text not null,
  ip_address inet,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  primary key (user_id, workspace_id, session_id)
);

create index if not exists security_presence_workspace_seen_idx
  on public.security_presence(workspace_id, last_seen_at desc);

create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  alert_type text not null,
  title text not null,
  summary text not null,
  signals jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create index if not exists security_alerts_workspace_time_idx
  on public.security_alerts(workspace_id, created_at desc);
create index if not exists security_alerts_status_time_idx
  on public.security_alerts(status, created_at desc);

alter table public.security_access_events enable row level security;
alter table public.security_presence enable row level security;
alter table public.security_alerts enable row level security;

revoke all on public.security_access_events from anon, authenticated;
revoke all on public.security_presence from anon, authenticated;
revoke all on public.security_alerts from anon, authenticated;
grant select on public.security_access_events to authenticated;
grant select on public.security_presence to authenticated;
grant select, update on public.security_alerts to authenticated;
grant all on public.security_access_events to service_role;
grant all on public.security_presence to service_role;
grant all on public.security_alerts to service_role;

drop policy if exists "security admins read access events" on public.security_access_events;
create policy "security admins read access events"
  on public.security_access_events for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'super_admin'::app_role));

drop policy if exists "security admins read presence" on public.security_presence;
create policy "security admins read presence"
  on public.security_presence for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
    or (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','admin']))
  );

drop policy if exists "security admins read alerts" on public.security_alerts;
create policy "security admins read alerts"
  on public.security_alerts for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
    or (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','admin']))
  );

drop policy if exists "security admins acknowledge alerts" on public.security_alerts;
create policy "security admins acknowledge alerts"
  on public.security_alerts for update to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
    or (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','admin']))
  )
  with check (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
    or (workspace_id is not null and public.has_workspace_role(workspace_id, array['owner','admin']))
  );

commit;
