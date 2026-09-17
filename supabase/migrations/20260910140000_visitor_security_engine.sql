-- Pulse AI Visitor Security Engine
-- Branch-only migration. Do not apply to Production until migration history is reconciled.

create table if not exists public.visitor_security_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  visitor_identifier text not null,
  ip_address inet,
  country_code text,
  region text,
  device_type text,
  browser text,
  os text,
  user_agent text,
  source text,
  referrer text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  session_started_at timestamptz not null default now(),
  session_ended_at timestamptz,
  risk_score numeric(5,4) not null default 0 check (risk_score between 0 and 1),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  violation_count integer not null default 0,
  repeat_violation_count integer not null default 0,
  status text not null default 'active' check (status in ('active','verification','blocked','ended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vss_workspace_last_seen on public.visitor_security_sessions(workspace_id,last_seen_at desc);
create index if not exists idx_vss_workspace_ip on public.visitor_security_sessions(workspace_id,ip_address);

create table if not exists public.visitor_security_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null references public.visitor_security_sessions(id) on delete cascade,
  event_type text not null,
  page_url text,
  action text,
  source text,
  risk_score numeric(5,4) not null default 0 check (risk_score between 0 and 1),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  violation boolean not null default false,
  violation_reason text,
  moderation_state text not null default 'approved' check (moderation_state in ('approved','unapproved','spam','trash','verification','blocked')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vse_workspace_created on public.visitor_security_events(workspace_id,created_at desc);
create index if not exists idx_vse_session_created on public.visitor_security_events(session_id,created_at desc);

create table if not exists public.visitor_security_blocks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  ip_address inet not null,
  visitor_identifier text,
  block_level text not null check (block_level in ('temporary','extended','permanent')),
  reason text not null,
  violation_number integer not null default 1,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_vsb_ip_active on public.visitor_security_blocks(ip_address,active,expires_at);
create index if not exists idx_vsb_workspace_created on public.visitor_security_blocks(workspace_id,created_at desc);

create table if not exists public.visitor_security_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid references public.visitor_security_sessions(id) on delete set null,
  event_id uuid references public.visitor_security_events(id) on delete set null,
  severity text not null check (severity in ('medium','high','critical')),
  title text not null,
  message text not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_vsa_workspace_created on public.visitor_security_alerts(workspace_id,created_at desc);

alter table public.visitor_security_sessions enable row level security;
alter table public.visitor_security_events enable row level security;
alter table public.visitor_security_blocks enable row level security;
alter table public.visitor_security_alerts enable row level security;

create or replace function public.can_manage_visitor_security(_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','admin')
  ) or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_admin')
  );
$$;

create policy visitor_security_sessions_admin_select on public.visitor_security_sessions
for select using (public.can_manage_visitor_security(workspace_id));
create policy visitor_security_events_admin_select on public.visitor_security_events
for select using (public.can_manage_visitor_security(workspace_id));
create policy visitor_security_blocks_admin_all on public.visitor_security_blocks
for all using (workspace_id is null or public.can_manage_visitor_security(workspace_id))
with check (workspace_id is null or public.can_manage_visitor_security(workspace_id));
create policy visitor_security_alerts_admin_all on public.visitor_security_alerts
for all using (public.can_manage_visitor_security(workspace_id))
with check (public.can_manage_visitor_security(workspace_id));

create or replace function public.visitor_security_check_ip(_workspace_id uuid, _ip inet)
returns table(blocked boolean, block_level text, message text)
language sql stable security definer set search_path = public
as $$
  select true, b.block_level, 'Aktiviteti po verifikohet nga Pulse AI Security.'
  from public.visitor_security_blocks b
  where (b.workspace_id = _workspace_id or b.workspace_id is null)
    and b.ip_address = _ip
    and b.active
    and (b.expires_at is null or b.expires_at > now())
  order by b.created_at desc
  limit 1;
$$;

create or replace function public.visitor_security_register_violation(
  _workspace_id uuid,
  _session_id uuid,
  _ip inet,
  _visitor_identifier text,
  _reason text,
  _risk_score numeric
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  prior_count integer;
  next_count integer;
  level text;
  ttl interval;
begin
  select count(*) into prior_count
  from public.visitor_security_blocks b
  where (b.workspace_id = _workspace_id or b.workspace_id is null)
    and b.ip_address = _ip
    and b.violation_number > 0;

  next_count := prior_count + 1;
  if next_count >= 3 then level := 'permanent'; ttl := null;
  elsif next_count = 2 then level := 'extended'; ttl := interval '24 hours';
  else level := 'temporary'; ttl := interval '15 minutes'; end if;

  insert into public.visitor_security_blocks(workspace_id,ip_address,visitor_identifier,block_level,reason,violation_number,expires_at,active)
  values (_workspace_id,_ip,_visitor_identifier,level,_reason,next_count,case when ttl is null then null else now()+ttl end,true);

  update public.visitor_security_sessions
  set violation_count = violation_count + 1,
      repeat_violation_count = greatest(repeat_violation_count, next_count - 1),
      risk_score = greatest(risk_score, coalesce(_risk_score,0)),
      risk_level = case when coalesce(_risk_score,0) >= .9 then 'critical' when coalesce(_risk_score,0) >= .7 then 'high' when coalesce(_risk_score,0) >= .4 then 'medium' else 'low' end,
      status = 'blocked', updated_at = now()
  where id = _session_id;

  insert into public.visitor_security_alerts(workspace_id,session_id,severity,title,message)
  values (_workspace_id,_session_id,case when next_count >= 3 then 'critical' when next_count=2 then 'high' else 'medium' end,
          'Visitor Security: IP action',
          format('Violation %s: %s. IP enforcement=%s.',next_count,_reason,level));

  return jsonb_build_object('violation_number',next_count,'block_level',level,'temporary',level <> 'permanent');
end;
$$;
