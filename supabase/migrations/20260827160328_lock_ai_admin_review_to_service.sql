revoke execute on function public.review_admin_role_ai(uuid,boolean,text) from authenticated;
revoke execute on function public.review_admin_role_ai(uuid,boolean,text) from anon;
drop policy if exists "platform admins can create admin role requests" on public.admin_role_requests;
create policy "platform admins can create admin role requests"
on public.admin_role_requests for insert to authenticated
with check (
  (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  and requested_role = 'admin'
  and requested_by = auth.uid()
);

create or replace function public.approve_admin_role(_request_id uuid, _reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_target uuid; v_requester uuid; v_ai text; v_status text;
begin
  if not (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only Owner or Pulse AI Admin can approve a Pulse AI Admin';
  end if;
  select target_user_id, requested_by, ai_status, status into v_target, v_requester, v_ai, v_status
  from public.admin_role_requests where id = _request_id for update;
  if not found or v_status <> 'pending' then raise exception 'Pending admin request not found'; end if;
  if v_requester = auth.uid() then raise exception 'The requesting admin cannot approve their own request'; end if;
  if v_ai <> 'approved' then raise exception 'AI approval is required before human approval'; end if;
  if public.has_role(v_target, 'admin') or public.has_role(v_target, 'super_admin') then raise exception 'User already has a platform admin role'; end if;

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
