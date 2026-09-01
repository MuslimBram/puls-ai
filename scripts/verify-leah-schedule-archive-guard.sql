\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('fe200000-0000-0000-0000-000000000001','authenticated','authenticated','leah-mr3-schedule-guard@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values ('fe100000-0000-0000-0000-000000000001','LEAH MR3 Schedule Guard','leah-mr3-schedule-guard','fe200000-0000-0000-0000-000000000001');

insert into public.workspace_members(workspace_id,user_id,role)
values ('fe100000-0000-0000-0000-000000000001','fe200000-0000-0000-0000-000000000001','owner');

insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values ('fe100000-0000-0000-0000-000000000001','active','mr3-schedule-guard-test',1);

insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values ('fe300000-0000-0000-0000-000000000001','fe100000-0000-0000-0000-000000000001','Guard Project','guard-project','fe200000-0000-0000-0000-000000000001');

insert into public.leah_schedules(
  id,workspace_id,project_id,name,cadence_seconds,enabled,input,next_run_at,created_by
) values (
  'fe600000-0000-0000-0000-000000000001','fe100000-0000-0000-0000-000000000001',
  'fe300000-0000-0000-0000-000000000001','Guard schedule',60,true,'{}',clock_timestamp()+interval '5 minutes',
  'fe200000-0000-0000-0000-000000000001'
);

update public.leah_projects
set status='archived', archived_at=clock_timestamp(), version=version+1
where id='fe300000-0000-0000-0000-000000000001';

do $$
declare enabled_now boolean;
begin
  select enabled into enabled_now
  from public.leah_schedules
  where id='fe600000-0000-0000-0000-000000000001';
  if enabled_now then raise exception 'Archive did not disable existing schedule'; end if;

  begin
    update public.leah_schedules
    set enabled=true
    where id='fe600000-0000-0000-0000-000000000001';
    raise exception 'Schedule on archived project was re-enabled';
  exception when others then
    if sqlerrm = 'Schedule on archived project was re-enabled' then raise; end if;
  end;
end $$;

rollback;
\echo 'LEAH SCHEDULE ARCHIVE GUARD CONTRACT: PASS'
