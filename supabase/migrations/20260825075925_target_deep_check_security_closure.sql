drop policy if exists "Owners can update members"
  on public.workspace_members;

drop policy if exists "Owners can remove members"
  on public.workspace_members;

create or replace function public.enforce_subscription_refund_initial_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.refund_status is distinct from 'requested' then
    raise exception 'New refund requests must start with refund_status=requested'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_subscription_refund_initial_state() from public;
revoke all on function public.enforce_subscription_refund_initial_state() from anon;
revoke all on function public.enforce_subscription_refund_initial_state() from authenticated;

drop trigger if exists trg_subscription_refunds_initial_state
  on public.subscription_refunds;

create trigger trg_subscription_refunds_initial_state
before insert on public.subscription_refunds
for each row
execute function public.enforce_subscription_refund_initial_state();

comment on function public.enforce_subscription_refund_initial_state()
is 'Trigger-only guard requiring new subscription refund rows to start in requested state.';;
