\set ON_ERROR_STOP on
begin;

do $$
begin
  if has_column_privilege('authenticated','public.leah_tasks','lease_owner','SELECT') then
    raise exception 'authenticated can read lease_owner';
  end if;
  if has_column_privilege('authenticated','public.leah_tasks','lease_token','SELECT') then
    raise exception 'authenticated can read lease_token';
  end if;
  if has_column_privilege('authenticated','public.leah_tasks','lease_expires_at','SELECT') then
    raise exception 'authenticated can read lease_expires_at';
  end if;
  if has_column_privilege('authenticated','public.leah_tasks','heartbeat_at','SELECT') then
    raise exception 'authenticated can read heartbeat_at';
  end if;

  if not has_column_privilege('authenticated','public.leah_tasks','status','SELECT') then
    raise exception 'authenticated lost safe task status read';
  end if;
  if not has_column_privilege('authenticated','public.leah_tasks','agent_role','SELECT') then
    raise exception 'authenticated lost safe task agent_role read';
  end if;
  if not has_column_privilege('service_role','public.leah_tasks','lease_token','SELECT') then
    raise exception 'service_role cannot read lease token';
  end if;
end $$;

rollback;
\echo 'LEAH TASK LEASE PRIVACY CONTRACT: PASS'
