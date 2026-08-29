#!/usr/bin/env bash
set -euo pipefail

: "${PGPASSWORD:=postgres}"

psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
drop database if exists p0_crm_a with (force);
create database p0_crm_a;
SQL

psql -h 127.0.0.1 -U postgres -d p0_crm_a -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema auth;

do $$
begin
  create role anon noinherit nologin;
exception when duplicate_object then null;
end
$$;
do $$
begin
  create role authenticated noinherit nologin;
exception when duplicate_object then null;
end
$$;
do $$
begin
  create role service_role noinherit nologin bypassrls;
exception when duplicate_object then null;
end
$$;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.workspaces (
  id uuid primary key,
  owner_id uuid not null
);
create table public.workspace_members (
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null
);
create table public.workspace_access_assignments (
  workspace_id uuid not null,
  user_id uuid not null,
  access_role text not null,
  is_active boolean not null default true,
  expires_at timestamptz null
);

create or replace function public.has_workspace_access_for_user(
  _workspace_id uuid,
  _user_id uuid
) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = _workspace_id and w.owner_id = _user_id
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = _workspace_id and wm.user_id = _user_id
  ) or exists (
    select 1 from public.workspace_access_assignments waa
    where waa.workspace_id = _workspace_id
      and waa.user_id = _user_id
      and waa.is_active
      and (waa.expires_at is null or waa.expires_at > now())
  )
$$;

create or replace function public.has_workspace_role(
  _workspace_id uuid,
  _roles text[]
) returns boolean
language sql stable security definer set search_path=''
as $$
  select
    ('owner' = any(_roles) and exists (
      select 1 from public.workspaces w
      where w.id = _workspace_id and w.owner_id = auth.uid()
    ))
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = _workspace_id
        and wm.user_id = auth.uid()
        and wm.role = any(_roles)
    )
    or exists (
      select 1
      from public.workspace_access_assignments waa
      where waa.workspace_id = _workspace_id
        and waa.user_id = auth.uid()
        and waa.is_active
        and (waa.expires_at is null or waa.expires_at > now())
        and case waa.access_role
          when 'business_admin' then 'admin'
          when 'manager' then 'member'
          when 'employee' then 'member'
          when 'freelancer' then 'member'
          else null
        end = any(_roles)
    )
$$;

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  color text not null default '#000000',
  is_default boolean not null default false
);
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null
);
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  lead_id uuid null constraint deals_lead_id_fkey references public.leads(id) on delete set null,
  stage_id uuid null constraint deals_stage_id_fkey references public.pipeline_stages(id) on delete set null,
  title text not null,
  updated_at timestamptz not null default now()
);
create table public.contact_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id),
  user_id uuid not null,
  name text not null,
  sort_order integer not null default 0
);
create table public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id),
  user_id uuid not null,
  contact_identifier text not null,
  tag_value text not null
);
create table public.enriched_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id),
  user_id uuid not null,
  contact_identifier text not null,
  constraint enriched_contacts_user_id_contact_identifier_key unique(user_id, contact_identifier)
);
create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id) on delete cascade,
  lead_id uuid not null constraint lead_scores_lead_id_fkey references public.leads(id) on delete cascade,
  score integer not null default 0,
  constraint lead_scores_lead_id_key unique(lead_id)
);
create table public.contact_consent (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  lead_id uuid null constraint contact_consent_lead_id_fkey references public.leads(id),
  channel text not null,
  consented boolean not null default false,
  constraint contact_consent_workspace_id_lead_id_channel_key unique(workspace_id,lead_id,channel)
);
create table public.deal_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  user_id uuid not null,
  content text not null
);
create table public.deal_tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  user_id uuid not null,
  title text not null,
  is_completed boolean not null default false
);
create table public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id),
  user_id uuid not null,
  activity_type text not null,
  description text not null
);

alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.contact_segments enable row level security;
alter table public.contact_tags enable row level security;
alter table public.enriched_contacts enable row level security;
alter table public.lead_scores enable row level security;
alter table public.contact_consent enable row level security;
alter table public.deal_notes enable row level security;
alter table public.deal_tasks enable row level security;
alter table public.deal_activities enable row level security;

create policy "Users can manage own pipeline_stages" on public.pipeline_stages for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own deals" on public.deals for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own contact_segments" on public.contact_segments for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own contact_tags" on public.contact_tags for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users manage own enriched contacts" on public.enriched_contacts for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Workspace members can manage lead scores" on public.lead_scores for all to authenticated using (true);
create policy "service_manage_consent" on public.contact_consent for all to public using (auth.uid() is null);
create policy "workspace_read_consent" on public.contact_consent for select to public using (true);
create policy "Users can manage own deal_notes" on public.deal_notes for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own deal_tasks" on public.deal_tasks for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "Users can manage own deal_activities" on public.deal_activities for all to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

grant all on table public.pipeline_stages, public.deals, public.contact_segments,
  public.contact_tags, public.enriched_contacts, public.lead_scores,
  public.contact_consent, public.deal_notes, public.deal_tasks,
  public.deal_activities to public, anon, authenticated, service_role;

insert into public.workspaces(id,owner_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
insert into public.workspace_members(workspace_id,user_id,role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','44444444-4444-4444-4444-444444444444','member'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','44444444-4444-4444-4444-444444444444','member');

insert into public.pipeline_stages(id,workspace_id,user_id,name,sort_order,is_default) values
  ('aaaaaaaa-1000-0000-0000-000000000001',null,'11111111-1111-1111-1111-111111111111','A default',0,true),
  ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B default',0,true);
insert into public.leads(id,workspace_id,user_id) values
  ('aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-2000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222');
insert into public.deals(id,workspace_id,user_id,lead_id,stage_id,title) values
  ('aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001','A deal'),
  ('bbbbbbbb-3000-0000-0000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','bbbbbbbb-2000-0000-0000-000000000001','bbbbbbbb-1000-0000-0000-000000000001','B deal');
insert into public.contact_segments(workspace_id,user_id,name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','A segment'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B segment');
insert into public.contact_tags(workspace_id,user_id,contact_identifier,tag_value) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a@example.test','A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','b@example.test','B');
insert into public.enriched_contacts(workspace_id,user_id,contact_identifier) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','b@example.test');
insert into public.lead_scores(workspace_id,lead_id,score) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-2000-0000-0000-000000000001',80),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-2000-0000-0000-000000000001',70);
insert into public.contact_consent(workspace_id,lead_id,channel,consented) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-2000-0000-0000-000000000001','email',true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-2000-0000-0000-000000000001','email',true);
insert into public.deal_notes(id,deal_id,user_id,content) values
  ('aaaaaaaa-4000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A note'),
  ('bbbbbbbb-4000-0000-0000-000000000001','bbbbbbbb-3000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','B note');
insert into public.deal_tasks(id,deal_id,user_id,title) values
  ('aaaaaaaa-5000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','A task'),
  ('bbbbbbbb-5000-0000-0000-000000000001','bbbbbbbb-3000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','B task');
insert into public.deal_activities(id,deal_id,user_id,activity_type,description) values
  ('aaaaaaaa-6000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','created','A activity'),
  ('bbbbbbbb-6000-0000-0000-000000000001','bbbbbbbb-3000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','created','B activity');
SQL

psql -h 127.0.0.1 -U postgres -d p0_crm_a -v ON_ERROR_STOP=1 +  -f supabase/migrations/20260829020000_p0_5_crm_a_workspace_isolation.sql

psql -h 127.0.0.1 -U postgres -d p0_crm_a -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'pipeline_stages','deals','contact_segments','contact_tags',
    'enriched_contacts','lead_scores'
  ]
  loop
    if exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=target_table
        and c.column_name='workspace_id'
        and c.is_nullable='YES'
    ) then
      raise exception 'workspace_id remains nullable on %', target_table;
    end if;
  end loop;

  if (select workspace_id from public.pipeline_stages where id='aaaaaaaa-1000-0000-0000-000000000001')
     <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid then
    raise exception 'unambiguous pipeline stage backfill failed';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename in (
        'pipeline_stages','deals','contact_segments','contact_tags',
        'enriched_contacts','lead_scores','contact_consent',
        'deal_notes','deal_tasks','deal_activities'
      )
      and (
        coalesce(qual,'') ilike '%auth.uid() = user_id%'
        or coalesce(with_check,'') ilike '%auth.uid() = user_id%'
        or coalesce(qual,'') ilike '%has_role(%admin%'
      )
  ) then
    raise exception 'legacy user/admin authorization remains';
  end if;

  foreach target_table in array array[
    'pipeline_stages','deals','contact_segments','contact_tags',
    'enriched_contacts','lead_scores','contact_consent',
    'deal_notes','deal_tasks','deal_activities'
  ]
  loop
    if has_table_privilege('anon', 'public.' || target_table, 'select')
       or has_table_privilege('anon', 'public.' || target_table, 'insert')
       or has_table_privilege('anon', 'public.' || target_table, 'update')
       or has_table_privilege('anon', 'public.' || target_table, 'delete') then
      raise exception 'anon retains CRM privilege on %', target_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || target_table, 'truncate')
       or has_table_privilege('authenticated', 'public.' || target_table, 'trigger')
       or has_table_privilege('authenticated', 'public.' || target_table, 'references') then
      raise exception 'authenticated retains dangerous CRM privilege on %', target_table;
    end if;
  end loop;

  if has_table_privilege('authenticated','public.enriched_contacts','insert')
     or has_table_privilege('authenticated','public.lead_scores','insert')
     or has_table_privilege('authenticated','public.contact_consent','insert')
     or has_table_privilege('authenticated','public.deal_activities','insert') then
    raise exception 'browser can write server-managed CRM data';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

do $$
declare
  new_deal uuid;
begin
  if (select count(*) from public.deals) <> 1 then
    raise exception 'owner can see cross-workspace deals';
  end if;
  if (select count(*) from public.pipeline_stages) <> 1 then
    raise exception 'owner can see cross-workspace stages';
  end if;
  if (select count(*) from public.contact_tags) <> 1 then
    raise exception 'owner can see cross-workspace tags';
  end if;
  if (select count(*) from public.lead_scores) <> 1 then
    raise exception 'owner can see cross-workspace scores';
  end if;
  if (select count(*) from public.contact_consent) <> 1 then
    raise exception 'owner can see cross-workspace consent';
  end if;
  if (select count(*) from public.deal_notes) <> 1 then
    raise exception 'owner can see cross-workspace deal notes';
  end if;
  if (select count(*) from public.deal_tasks) <> 1 then
    raise exception 'owner can see cross-workspace deal tasks';
  end if;
  if (select count(*) from public.deal_activities) <> 1 then
    raise exception 'owner can see cross-workspace deal activities';
  end if;

  insert into public.pipeline_stages(workspace_id,user_id,name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Owner stage');

  insert into public.deals(workspace_id,user_id,title)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Owner deal')
  returning id into new_deal;
  delete from public.deals where id=new_deal;

  begin
    insert into public.deals(workspace_id,user_id,title)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Cross workspace');
    raise exception 'cross-workspace deal insert was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.deals(workspace_id,user_id,stage_id,title)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      'bbbbbbbb-1000-0000-0000-000000000001',
      'Cross stage'
    );
    raise exception 'cross-workspace stage link was allowed';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.deals(workspace_id,user_id,lead_id,title)
    values (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      'bbbbbbbb-2000-0000-0000-000000000001',
      'Cross lead'
    );
    raise exception 'cross-workspace lead link was allowed';
  exception when foreign_key_violation then null;
  end;
end
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);

do $$
declare
  member_deal uuid;
  affected bigint;
begin
  insert into public.deals(workspace_id,user_id,title)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','Member deal')
  returning id into member_deal;
  insert into public.contact_tags(workspace_id,user_id,contact_identifier,tag_value)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','member@example.test','member');
  insert into public.deal_notes(deal_id,user_id,content)
  values (member_deal,'33333333-3333-3333-3333-333333333333','Member note');
  insert into public.deal_tasks(deal_id,user_id,title)
  values (member_deal,'33333333-3333-3333-3333-333333333333','Member task');

  begin
    insert into public.pipeline_stages(workspace_id,user_id,name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333','Member stage');
    raise exception 'member pipeline administration was allowed';
  exception when insufficient_privilege then null;
  end;

  delete from public.deals where id='aaaaaaaa-3000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'member deleted an existing workspace deal';
  end if;

  begin
    insert into public.deal_notes(deal_id,user_id,content)
    values (
      'bbbbbbbb-3000-0000-0000-000000000001',
      '33333333-3333-3333-3333-333333333333',
      'Cross workspace note'
    );
    raise exception 'cross-workspace deal note was allowed';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.contact_consent(workspace_id,lead_id,channel)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-2000-0000-0000-000000000001','sms');
    raise exception 'browser consent mutation was allowed';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-4444-444444444444',false);

do $$
begin
  begin
    update public.deals
    set workspace_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    where id='aaaaaaaa-3000-0000-0000-000000000001';
    raise exception 'multi-workspace member moved a deal across tenants';
  exception when insufficient_privilege then null;
  end;

  if (select workspace_id from public.deals where id='aaaaaaaa-3000-0000-0000-000000000001')
     <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid then
    raise exception 'deal workspace changed despite immutability trigger';
  end if;
end
$$;

reset role;
SQL
