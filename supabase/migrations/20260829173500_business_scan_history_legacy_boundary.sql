begin;

lock table public.business_scan_history in share row exclusive mode;

do $$
declare
  legacy_id constant uuid := '5f8fbf39-982c-406f-bf76-51f639a6abfb'::uuid;
begin
  if not exists(
    select 1 from public.business_scan_history x
    where x.id=legacy_id
      and x.workspace_id='8b1afa42-9655-4347-8951-236218f1fd56'::uuid
      and x.business_id='5e90e4cb-113f-4f32-b5d5-311f550e1176'::uuid
      and x.triggered_by='d87c4aa5-aadf-4510-93a9-e4cd9fc4895b'::uuid
      and x.status='completed'
      and x.scanned_url='https://muslimi-digital.in'
  ) then
    raise exception 'Cannot harden business_scan_history: expected legacy orphan changed or disappeared';
  end if;

  if exists(select 1 from public.business_ai_content x where x.scan_history_id=legacy_id) then
    raise exception 'Cannot harden business_scan_history: legacy orphan gained child references';
  end if;

  if exists(
    select 1
    from public.business_scan_history x
    where x.id<>legacy_id
      and (
        not exists(select 1 from public.workspaces w where w.id=x.workspace_id)
        or not exists(
          select 1 from public.business_profiles b
          where b.id=x.business_id and b.workspace_id=x.workspace_id
        )
      )
  ) then
    raise exception 'Cannot harden business_scan_history: additional orphan or workspace mismatch exists';
  end if;
end
$$;

create or replace function public.enforce_business_scan_history_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    if new.workspace_id is distinct from old.workspace_id
       or new.business_id is distinct from old.business_id
       or new.triggered_by is distinct from old.triggered_by then
      raise exception 'business_scan_history tenant and creator identity are immutable';
    end if;
  end if;
  return new;
end
$$;

create or replace function public.enforce_business_scan_history_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='INSERT'
     or new.workspace_id is distinct from old.workspace_id
     or new.business_id is distinct from old.business_id then
    if not exists(
      select 1 from public.business_profiles b
      where b.id=new.business_id and b.workspace_id=new.workspace_id
    ) then
      raise exception 'business_scan_history business/workspace parent mismatch';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.enforce_business_scan_history_identity()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_business_scan_history_parent()
  from public,anon,authenticated,service_role;

drop policy if exists "Admins can manage all business scans" on public.business_scan_history;
drop policy if exists "Workspace members can view their business scans" on public.business_scan_history;

alter table public.business_scan_history enable row level security;
revoke all privileges on table public.business_scan_history
  from public,anon,authenticated,sandbox_exec,service_role;
grant select,insert,update on table public.business_scan_history to authenticated;
grant select,insert,update,delete on table public.business_scan_history to service_role;

create policy "p1_business_scan_history_select_ws"
on public.business_scan_history for select to authenticated
using (public.has_workspace_access(workspace_id));

create policy "p1_business_scan_history_insert_ws"
on public.business_scan_history for insert to authenticated
with check (
  triggered_by=(select auth.uid())
  and public.has_workspace_role(workspace_id,array['owner','admin','member'])
);

create policy "p1_business_scan_history_update_ws"
on public.business_scan_history for update to authenticated
using (public.has_workspace_role(workspace_id,array['owner','admin','member']))
with check (public.has_workspace_role(workspace_id,array['owner','admin','member']));

drop trigger if exists trg_business_scan_history_identity on public.business_scan_history;
create trigger trg_business_scan_history_identity
before update on public.business_scan_history
for each row execute function public.enforce_business_scan_history_identity();

drop trigger if exists trg_business_scan_history_parent on public.business_scan_history;
create trigger trg_business_scan_history_parent
before insert or update on public.business_scan_history
for each row execute function public.enforce_business_scan_history_parent();

comment on table public.business_scan_history is
  'Workspace-scoped scan history. One known pre-hardening legacy orphan is preserved service-role-only until explicitly reconciled; new writes must have a valid business/workspace parent.';

commit;
