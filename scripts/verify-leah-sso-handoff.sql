\set ON_ERROR_STOP on
begin;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
('fd200000-0000-4000-8000-000000000001','authenticated','authenticated','leah-mr5-sso-owner@example.invalid','',now(),now(),now()),
('fd200000-0000-4000-8000-000000000002','authenticated','authenticated','leah-mr5-sso-revoked@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
('fd100000-0000-4000-8000-000000000001','LEAH MR5 SSO A','leah-mr5-sso-a','fd200000-0000-4000-8000-000000000001'),
('fd100000-0000-4000-8000-000000000002','LEAH MR5 SSO B','leah-mr5-sso-b','fd200000-0000-4000-8000-000000000002');

insert into public.workspace_members(workspace_id,user_id,role)
values
('fd100000-0000-4000-8000-000000000001','fd200000-0000-4000-8000-000000000001','owner'),
('fd100000-0000-4000-8000-000000000002','fd200000-0000-4000-8000-000000000002','owner');

insert into public.leah_workspace_entitlements(
  workspace_id,status,source,concurrency_limit,included_monthly_tokens,storage_bytes_limit
) values
('fd100000-0000-4000-8000-000000000001','active','mr5-sso-test',2,1000,100000),
('fd100000-0000-4000-8000-000000000002','active','mr5-sso-test',1,100,1000);

-- Browser roles must not execute the handoff internals or read ticket/session material.
do $$
begin
  if has_function_privilege('anon','public.leah_redeem_handoff(text,text,timestamptz)','EXECUTE') then
    raise exception 'anon can execute LEAH handoff redemption';
  end if;
  if has_function_privilege('authenticated','public.leah_redeem_handoff(text,text,timestamptz)','EXECUTE') then
    raise exception 'authenticated can execute LEAH handoff redemption';
  end if;
  if has_table_privilege('authenticated','public.leah_handoff_tickets','SELECT') then
    raise exception 'authenticated can read LEAH handoff ticket hashes';
  end if;
  if has_table_privilege('authenticated','public.leah_access_sessions','SELECT') then
    raise exception 'authenticated can read LEAH session hashes';
  end if;
end $$;

insert into public.leah_handoff_tickets(
  workspace_id,user_id,code_hash,expires_at
) values (
  'fd100000-0000-4000-8000-000000000001',
  'fd200000-0000-4000-8000-000000000001',
  repeat('a',64),
  clock_timestamp()+interval '60 seconds'
);

do $$
declare
  r jsonb;
  sid uuid;
  stored_hash text;
  consumed timestamptz;
begin
  r := public.leah_redeem_handoff(
    repeat('a',64), repeat('b',64), clock_timestamp()+interval '60 minutes'
  );
  if r->>'workspace_id' <> 'fd100000-0000-4000-8000-000000000001' then raise exception 'Handoff changed workspace'; end if;
  if r->>'user_id' <> 'fd200000-0000-4000-8000-000000000001' then raise exception 'Handoff changed user'; end if;
  if r->>'role' <> 'owner' then raise exception 'Handoff role mapping mismatch'; end if;
  sid := (r->>'session_id')::uuid;
  if sid is null then raise exception 'Handoff did not create session'; end if;

  select token_hash into stored_hash from public.leah_access_sessions where id=sid;
  if stored_hash <> repeat('b',64) then raise exception 'Handoff session hash mismatch'; end if;
  if stored_hash = repeat('a',64) then raise exception 'Handoff code hash reused as session authority'; end if;

  select consumed_at into consumed from public.leah_handoff_tickets where code_hash=repeat('a',64);
  if consumed is null then raise exception 'Handoff ticket was not consumed'; end if;
end $$;

-- One-time means one-time: the same code cannot create a second session.
do $$
begin
  begin
    perform public.leah_redeem_handoff(
      repeat('a',64), repeat('c',64), clock_timestamp()+interval '60 minutes'
    );
    raise exception 'Consumed handoff was accepted twice';
  exception when others then
    if sqlerrm = 'Consumed handoff was accepted twice' then raise; end if;
    if sqlerrm not like '%LEAH_HANDOFF_INVALID%' then raise; end if;
  end;
end $$;

-- Role removal after issuance must invalidate redemption before session creation.
insert into public.leah_handoff_tickets(workspace_id,user_id,code_hash,expires_at)
values ('fd100000-0000-4000-8000-000000000002','fd200000-0000-4000-8000-000000000002',repeat('d',64),clock_timestamp()+interval '60 seconds');
delete from public.workspace_members
where workspace_id='fd100000-0000-4000-8000-000000000002'
  and user_id='fd200000-0000-4000-8000-000000000002';
update public.workspaces set owner_id='fd200000-0000-4000-8000-000000000001'
where id='fd100000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.leah_redeem_handoff(repeat('d',64),repeat('e',64),clock_timestamp()+interval '60 minutes');
    raise exception 'Revoked workspace access still redeemed handoff';
  exception when others then
    if sqlerrm = 'Revoked workspace access still redeemed handoff' then raise; end if;
    if sqlerrm not like '%LEAH_HANDOFF_ACCESS_REVOKED%' then raise; end if;
  end;
  if exists(select 1 from public.leah_access_sessions where token_hash=repeat('e',64)) then
    raise exception 'Revoked user obtained a LEAH session';
  end if;
end $$;

-- Entitlement suspension between issuance and redemption must also fail closed.
insert into public.workspace_members(workspace_id,user_id,role)
values ('fd100000-0000-4000-8000-000000000002','fd200000-0000-4000-8000-000000000002','member');
insert into public.leah_handoff_tickets(workspace_id,user_id,code_hash,expires_at)
values ('fd100000-0000-4000-8000-000000000002','fd200000-0000-4000-8000-000000000002',repeat('f',64),clock_timestamp()+interval '60 seconds');
update public.leah_workspace_entitlements set status='suspended'
where workspace_id='fd100000-0000-4000-8000-000000000002';

do $$
begin
  begin
    perform public.leah_redeem_handoff(repeat('f',64),repeat('1',64),clock_timestamp()+interval '60 minutes');
    raise exception 'Suspended entitlement redeemed handoff';
  exception when others then
    if sqlerrm = 'Suspended entitlement redeemed handoff' then raise; end if;
    if sqlerrm not like '%LEAH_HANDOFF_ENTITLEMENT_INACTIVE%' then raise; end if;
  end;
end $$;

rollback;
\echo 'LEAH PULSE SSO HANDOFF CONTRACT: PASS'
