create table if not exists public.admin_role_requests (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_role public.app_role not null default 'admin',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  ai_status text not null default 'pending' check (ai_status in ('pending','approved','rejected','not_required')),
  ai_reviewed_at timestamptz,
  ai_reason text,
  human_approver_id uuid references auth.users(id) on delete restrict,
  human_approval_role text check (human_approval_role in ('admin','super_admin')),
  human_approved_at timestamptz,
  human_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_role_requests_target_role check (requested_role = 'admin'),
  constraint admin_role_requests_not_self check (target_user_id <> requested_by)
);

create unique index if not exists idx_one_pending_admin_request_per_user
  on public.admin_role_requests(target_user_id)
  where status = 'pending';
create index if not exists idx_admin_role_requests_status on public.admin_role_requests(status, created_at desc);
create index if not exists idx_admin_role_requests_target on public.admin_role_requests(target_user_id);

alter table public.admin_role_requests enable row level security;

drop policy if exists "platform admins can view admin role requests" on public.admin_role_requests;
create policy "platform admins can view admin role requests"
on public.admin_role_requests for select to authenticated
using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin'));

drop policy if exists "platform admins can create admin role requests" on public.admin_role_requests;
create policy "platform admins can create admin role requests"
on public.admin_role_requests for insert to authenticated
with check (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
);

create or replace function public.request_admin_role(_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only Owner or Pulse AI Admin can request another Pulse AI Admin';
  end if;
  if _target_user_id = auth.uid() then raise exception 'You cannot request admin for yourself'; end if;
  if public.has_role(_target_user_id, 'admin') or public.has_role(_target_user_id, 'super_admin') then
    raise exception 'User already has a platform admin role';
  end if;
  insert into public.admin_role_requests(target_user_id, requested_by, requested_role)
  values (_target_user_id, auth.uid(), 'admin') returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_admin_role(uuid) from public;
grant execute on function public.request_admin_role(uuid) to authenticated;

create or replace function public.review_admin_role_ai(_request_id uuid, _approved boolean, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only platform admins can record the AI review';
  end if;
  update public.admin_role_requests
  set ai_status = case when _approved then 'approved' else 'rejected' end,
      ai_reviewed_at = now(), ai_reason = _reason, updated_at = now()
  where id = _request_id and status = 'pending';
  if not found then raise exception 'Pending admin request not found'; end if;
end;
$$;
revoke all on function public.review_admin_role_ai(uuid,boolean,text) from public;
grant execute on function public.review_admin_role_ai(uuid,boolean,text) to authenticated;

create or replace function public.approve_admin_role(_request_id uuid, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_target uuid; v_requester uuid; v_ai text;
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only Owner or Pulse AI Admin can approve a Pulse AI Admin';
  end if;
  select target_user_id, requested_by, ai_status into v_target, v_requester, v_ai
  from public.admin_role_requests where id = _request_id and status = 'pending' for update;
  if not found then raise exception 'Pending admin request not found'; end if;
  if v_requester = auth.uid() then raise exception 'The requesting admin cannot approve their own request'; end if;
  if v_ai <> 'approved' then raise exception 'AI approval is required before human approval'; end if;

  insert into public.user_roles(user_id, role) values (v_target, 'admin') on conflict do nothing;
  update public.admin_role_requests
  set status='approved', human_approver_id=auth.uid(),
      human_approval_role=case when public.has_role(auth.uid(), 'super_admin') then 'super_admin' else 'admin' end,
      human_approved_at=now(), human_reason=_reason, updated_at=now()
  where id=_request_id;
end;
$$;
revoke all on function public.approve_admin_role(uuid,text) from public;
grant execute on function public.approve_admin_role(uuid,text) to authenticated;

create or replace function public.reject_admin_role(_request_id uuid, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only platform admins can reject an admin request';
  end if;
  update public.admin_role_requests
  set status='rejected', human_approver_id=auth.uid(),
      human_approval_role=case when public.has_role(auth.uid(), 'super_admin') then 'super_admin' else 'admin' end,
      human_approved_at=now(), human_reason=_reason, updated_at=now()
  where id=_request_id and status='pending';
  if not found then raise exception 'Pending admin request not found'; end if;
end;
$$;
revoke all on function public.reject_admin_role(uuid,text) from public;
grant execute on function public.reject_admin_role(uuid,text) to authenticated;

create or replace function public.touch_admin_role_requests_updated_at()
returns trigger language plpgsql security invoker set search_path=public
as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists trg_admin_role_requests_updated_at on public.admin_role_requests;
create trigger trg_admin_role_requests_updated_at before update on public.admin_role_requests for each row execute function public.touch_admin_role_requests_updated_at();
