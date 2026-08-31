begin;

-- The original security monitor rollout allowed authenticated users who pass
-- the alert RLS policy to UPDATE every column in security_alerts. The UI only
-- needs to acknowledge an open alert. Keep that capability, but remove the
-- broader row-integrity mutation surface.
revoke update on table public.security_alerts from authenticated;
grant update (status, acknowledged_at) on table public.security_alerts to authenticated;

create or replace function public.enforce_security_alert_acknowledge_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() = 'authenticated' then
    if old.status is distinct from 'open' or new.status is distinct from 'acknowledged' then
      raise exception using
        errcode = '42501',
        message = 'authenticated callers may only acknowledge open security alerts';
    end if;

    -- Server-authoritative acknowledgement time; ignore any client timestamp.
    new.acknowledged_at := statement_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_security_alert_acknowledge_only() from public, anon, authenticated;
grant execute on function public.enforce_security_alert_acknowledge_only() to service_role;

comment on function public.enforce_security_alert_acknowledge_only() is
  'Preserves security alert integrity: authenticated callers may only transition open -> acknowledged and the server sets acknowledged_at.';

drop trigger if exists trg_security_alert_acknowledge_only on public.security_alerts;
create trigger trg_security_alert_acknowledge_only
before update on public.security_alerts
for each row
execute function public.enforce_security_alert_acknowledge_only();

commit;
