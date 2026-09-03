\set ON_ERROR_STOP on
begin;

create temp table mr8c_state(key text primary key,payload jsonb) on commit drop;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('e8c00000-0000-4000-8000-000000000001','authenticated','authenticated','mr8c-a@example.invalid','',now(),now(),now()),
  ('e8c00000-0000-4000-8000-000000000002','authenticated','authenticated','mr8c-b@example.invalid','',now(),now(),now());

insert into public.workspaces(id,name,slug,owner_id)
values
  ('e8c10000-0000-4000-8000-000000000001','MR8C Workspace A','mr8c-a','e8c00000-0000-4000-8000-000000000001'),
  ('e8c10000-0000-4000-8000-000000000002','MR8C Workspace B','mr8c-b','e8c00000-0000-4000-8000-000000000002');
insert into public.workspace_members(workspace_id,user_id,role)
values
  ('e8c10000-0000-4000-8000-000000000001','e8c00000-0000-4000-8000-000000000001','owner'),
  ('e8c10000-0000-4000-8000-000000000002','e8c00000-0000-4000-8000-000000000002','owner');
insert into public.leah_workspace_entitlements(workspace_id,status,source,concurrency_limit)
values
  ('e8c10000-0000-4000-8000-000000000001','active','mr8c-test',4),
  ('e8c10000-0000-4000-8000-000000000002','active','mr8c-test',1);
insert into public.leah_projects(id,workspace_id,name,slug,created_by)
values
  ('e8c20000-0000-4000-8000-000000000001','e8c10000-0000-4000-8000-000000000001','MR8C Project A','mr8c-project-a','e8c00000-0000-4000-8000-000000000001'),
  ('e8c20000-0000-4000-8000-000000000002','e8c10000-0000-4000-8000-000000000002','MR8C Project B','mr8c-project-b','e8c00000-0000-4000-8000-000000000002');
insert into public.leah_executions(id,workspace_id,project_id,requested_by,status,idempotency_key,input)
values
  ('e8c30000-0000-4000-8000-000000000001','e8c10000-0000-4000-8000-000000000001','e8c20000-0000-4000-8000-000000000001','e8c00000-0000-4000-8000-000000000001','queued','mr8c-a','{}'),
  ('e8c30000-0000-4000-8000-000000000002','e8c10000-0000-4000-8000-000000000002','e8c20000-0000-4000-8000-000000000002','e8c00000-0000-4000-8000-000000000002','queued','mr8c-b','{}');

-- Direct browser access is structurally denied.
do $$
begin
  if has_table_privilege('authenticated','public.leah_agent_messages','SELECT') then raise exception 'authenticated can read agent bus'; end if;
  if has_table_privilege('authenticated','public.leah_agent_messages','INSERT') then raise exception 'authenticated can forge agent messages'; end if;
  if has_function_privilege('authenticated','public.leah_agent_bus_send_for_task(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,timestamptz,integer)','EXECUTE') then
    raise exception 'authenticated can send on internal agent bus';
  end if;
  if has_function_privilege('authenticated','public.leah_agent_bus_receive_for_task(uuid,uuid,integer,integer)','EXECUTE') then
    raise exception 'authenticated can receive internal agent messages';
  end if;
end $$;

-- Sender, receiver and a terminal-target task in workspace A.
insert into mr8c_state(key,payload)
values ('sender',public.leah_enqueue_task('e8c30000-0000-4000-8000-000000000001',1000,'{"name":"sender"}'::jsonb,'planner',null,null,'{}'::uuid[],3));
insert into mr8c_state(key,payload)
values ('receiver',public.leah_enqueue_task('e8c30000-0000-4000-8000-000000000001',900,'{"name":"receiver"}'::jsonb,'reviewer',null,null,'{}'::uuid[],3));
insert into mr8c_state(key,payload)
values ('target',public.leah_enqueue_task('e8c30000-0000-4000-8000-000000000001',100,'{"name":"target"}'::jsonb,'critic',null,null,'{}'::uuid[],3));
insert into mr8c_state(key,payload)
values ('foreign',public.leah_enqueue_task('e8c30000-0000-4000-8000-000000000002',500,'{"name":"foreign"}'::jsonb,'reviewer',null,null,'{}'::uuid[],3));

insert into mr8c_state(key,payload) values ('sender_claim',public.leah_claim_next_task('mr8c-sender-worker',180));
insert into mr8c_state(key,payload) values ('receiver_claim',public.leah_claim_next_task('mr8c-receiver-worker',180));

do $$
declare a jsonb;b jsonb;
begin
  select payload into a from mr8c_state where key='sender_claim';
  select payload into b from mr8c_state where key='receiver_claim';
  if a->'input'->>'name'<>'sender' or b->'input'->>'name'<>'receiver' then raise exception 'MR8C task claim order mismatch'; end if;
end $$;

-- Durable request send + same-key replay.
insert into mr8c_state(key,payload)
select 'request',public.leah_agent_bus_send_for_task(
  (s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid,null,
  'review.plan','request','{"question":"Review the plan"}'::jsonb,'request-1',null,null,5
)
from mr8c_state s cross join mr8c_state r where s.key='sender_claim' and r.key='receiver_claim';

insert into mr8c_state(key,payload)
select 'request_replay',public.leah_agent_bus_send_for_task(
  (s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,(r.payload->>'id')::uuid,null,
  'review.plan','request','{"question":"Review the plan"}'::jsonb,'request-1',null,null,5
)
from mr8c_state s cross join mr8c_state r where s.key='sender_claim' and r.key='receiver_claim';

do $$
declare a jsonb;b jsonb;
begin
  select payload into a from mr8c_state where key='request';
  select payload into b from mr8c_state where key='request_replay';
  if a->>'id'<>b->>'id' or coalesce((b->>'idempotent_replay')::boolean,false) is not true then raise exception 'agent bus idempotent replay failed'; end if;
end $$;

-- Same idempotency key with different payload is a hard conflict.
do $$
declare s jsonb;r jsonb;
begin
  select payload into s from mr8c_state where key='sender_claim';
  select payload into r from mr8c_state where key='receiver_claim';
  begin
    perform public.leah_agent_bus_send_for_task((s->>'id')::uuid,(s->>'lease_token')::uuid,(r->>'id')::uuid,null,
      'review.plan','request','{"question":"DIFFERENT"}'::jsonb,'request-1',null,null,5);
    raise exception 'agent bus idempotency conflict was accepted';
  exception when others then
    if sqlerrm='agent bus idempotency conflict was accepted' then raise; end if;
  end;
end $$;

-- Cross-workspace / cross-execution target is rejected.
do $$
declare s jsonb;f jsonb;
begin
  select payload into s from mr8c_state where key='sender_claim';
  select payload into f from mr8c_state where key='foreign';
  begin
    perform public.leah_agent_bus_send_for_task((s->>'id')::uuid,(s->>'lease_token')::uuid,(f->>'id')::uuid,null,
      'review.foreign','command','{}'::jsonb,'foreign-target',null,null,5);
    raise exception 'cross-workspace agent target succeeded';
  exception when others then
    if sqlerrm='cross-workspace agent target succeeded' then raise; end if;
  end;
end $$;

-- Receiver gets exactly one delivery token; it is not redelivered before timeout.
insert into mr8c_state(key,payload)
select 'received_request',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,60)
from mr8c_state r where r.key='receiver_claim';

do $$
declare x jsonb;req jsonb;
begin
  select payload into x from mr8c_state where key='received_request';
  select payload into req from mr8c_state where key='request';
  if jsonb_array_length(x)<>1 then raise exception 'request delivery count mismatch'; end if;
  if x->0->>'id'<>req->>'id' or x->0->>'delivery_token' is null then raise exception 'request delivery token missing'; end if;
end $$;

insert into mr8c_state(key,payload)
select 'receive_again',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,60)
from mr8c_state r where r.key='receiver_claim';

do $$
declare x jsonb;
begin
  select payload into x from mr8c_state where key='receive_again';
  if jsonb_array_length(x)<>0 then raise exception 'delivered message was redelivered before timeout'; end if;
end $$;

-- Wrong delivery token cannot ACK.
do $$
declare r jsonb;msg jsonb;
begin
  select payload into r from mr8c_state where key='receiver_claim';
  select payload->0 into msg from mr8c_state where key='received_request';
  begin
    perform public.leah_agent_bus_ack_for_task((r->>'id')::uuid,(r->>'lease_token')::uuid,(msg->>'id')::uuid,gen_random_uuid());
    raise exception 'wrong delivery token acknowledged message';
  exception when others then
    if sqlerrm='wrong delivery token acknowledged message' then raise; end if;
  end;
end $$;

-- Response is correlation-bound to the original request and routed back to sender.
insert into mr8c_state(key,payload)
select 'response',public.leah_agent_bus_send_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,(s.payload->>'id')::uuid,null,
  'review.plan','response','{"answer":"approved"}'::jsonb,'response-1',(q.payload->>'id')::uuid,null,5
)
from mr8c_state r cross join mr8c_state s cross join mr8c_state q
where r.key='receiver_claim' and s.key='sender_claim' and q.key='request';

do $$
declare q jsonb;a jsonb;
begin
  select payload into q from mr8c_state where key='request';
  select payload into a from mr8c_state where key='response';
  if q->>'correlation_id'<>a->>'correlation_id' or a->>'reply_to_id'<>q->>'id' then raise exception 'request/response correlation mismatch'; end if;
end $$;

-- ACK original request with its current delivery token.
insert into mr8c_state(key,payload)
select 'request_ack',public.leah_agent_bus_ack_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,(m.payload->0->>'id')::uuid,(m.payload->0->>'delivery_token')::uuid
)
from mr8c_state r cross join mr8c_state m where r.key='receiver_claim' and m.key='received_request';

-- Sender receives and ACKs the response.
insert into mr8c_state(key,payload)
select 'received_response',public.leah_agent_bus_receive_for_task((s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,10,60)
from mr8c_state s where s.key='sender_claim';

do $$
declare x jsonb;a jsonb;
begin
  select payload into x from mr8c_state where key='received_response';
  select payload into a from mr8c_state where key='response';
  if jsonb_array_length(x)<>1 or x->0->>'id'<>a->>'id' then raise exception 'response delivery failed'; end if;
end $$;

insert into mr8c_state(key,payload)
select 'response_ack',public.leah_agent_bus_ack_for_task(
  (s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,(m.payload->0->>'id')::uuid,(m.payload->0->>'delivery_token')::uuid
)
from mr8c_state s cross join mr8c_state m where s.key='sender_claim' and m.key='received_response';

-- Role-targeted message retry then explicit dead-letter.
insert into mr8c_state(key,payload)
select 'role_message',public.leah_agent_bus_send_for_task(
  (s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,null,'reviewer','review.retry','event','{"step":1}'::jsonb,
  'role-retry',null,null,2
) from mr8c_state s where s.key='sender_claim';
insert into mr8c_state(key,payload)
select 'role_delivery_one',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,60)
from mr8c_state r where r.key='receiver_claim';
insert into mr8c_state(key,payload)
select 'role_retry',public.leah_agent_bus_fail_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,(m.payload->0->>'id')::uuid,(m.payload->0->>'delivery_token')::uuid,
  true,'temporary_failure',0
) from mr8c_state r cross join mr8c_state m where r.key='receiver_claim' and m.key='role_delivery_one';
insert into mr8c_state(key,payload)
select 'role_delivery_two',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,60)
from mr8c_state r where r.key='receiver_claim';
insert into mr8c_state(key,payload)
select 'role_dead',public.leah_agent_bus_fail_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,(m.payload->0->>'id')::uuid,(m.payload->0->>'delivery_token')::uuid,
  true,'still_failing',0
) from mr8c_state r cross join mr8c_state m where r.key='receiver_claim' and m.key='role_delivery_two';

do $$
declare d jsonb;
begin
  select payload into d from mr8c_state where key='role_dead';
  if d->>'status'<>'dead_letter' or (d->>'delivery_attempts')::integer<>2 then raise exception 'agent bus dead-letter exhaustion failed'; end if;
end $$;

-- Delivery timeout requeues and rotates the delivery token; old token cannot ACK.
insert into mr8c_state(key,payload)
select 'timeout_message',public.leah_agent_bus_send_for_task(
  (s.payload->>'id')::uuid,(s.payload->>'lease_token')::uuid,null,'reviewer','review.timeout','event','{}'::jsonb,
  'timeout-1',null,null,3
) from mr8c_state s where s.key='sender_claim';
insert into mr8c_state(key,payload)
select 'timeout_delivery_one',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,15)
from mr8c_state r where r.key='receiver_claim';
update public.leah_agent_messages
set delivery_expires_at=clock_timestamp()-interval '1 second'
where id=(select (payload->0->>'id')::uuid from mr8c_state where key='timeout_delivery_one');
select public.leah_agent_bus_reap(500);
insert into mr8c_state(key,payload)
select 'timeout_delivery_two',public.leah_agent_bus_receive_for_task((r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,10,60)
from mr8c_state r where r.key='receiver_claim';

do $$
declare oldm jsonb;newm jsonb;r jsonb;
begin
  select payload->0 into oldm from mr8c_state where key='timeout_delivery_one';
  select payload->0 into newm from mr8c_state where key='timeout_delivery_two';
  select payload into r from mr8c_state where key='receiver_claim';
  if oldm->>'id'<>newm->>'id' or oldm->>'delivery_token'=newm->>'delivery_token' then raise exception 'delivery token was not rotated on redelivery'; end if;
  begin
    perform public.leah_agent_bus_ack_for_task((r->>'id')::uuid,(r->>'lease_token')::uuid,(oldm->>'id')::uuid,(oldm->>'delivery_token')::uuid);
    raise exception 'stale delivery token acknowledged redelivery';
  exception when others then
    if sqlerrm='stale delivery token acknowledged redelivery' then raise; end if;
  end;
end $$;

-- A terminal exact recipient cancels its queued message.
insert into mr8c_state(key,payload)
select 'target_message',public.leah_agent_bus_send_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,(t.payload->>'id')::uuid,null,'critic.task','command','{}'::jsonb,
  'target-terminal',null,null,5
) from mr8c_state r cross join mr8c_state t where r.key='receiver_claim' and t.key='target';
update public.leah_tasks set status='cancelled',ended_at=clock_timestamp(),updated_at=clock_timestamp()
where id=(select (payload->>'id')::uuid from mr8c_state where key='target');

do $$
declare m jsonb;
begin
  select payload into m from mr8c_state where key='target_message';
  if not exists(select 1 from public.leah_agent_messages where id=(m->>'id')::uuid and status='cancelled' and error_code='recipient_task_terminal') then
    raise exception 'terminal recipient did not cancel targeted message';
  end if;
end $$;

-- Once sender lease is finished, it cannot create a new message.
do $$
declare s jsonb;
begin
  select payload into s from mr8c_state where key='sender_claim';
  perform public.leah_finish_task((s->>'id')::uuid,(s->>'lease_token')::uuid,'succeeded','{}'::jsonb,null,0);
  begin
    perform public.leah_agent_bus_send_for_task((s->>'id')::uuid,(s->>'lease_token')::uuid,null,'reviewer','stale.send','event','{}'::jsonb,'stale-send',null,null,5);
    raise exception 'stale sender lease created agent message';
  exception when others then
    if sqlerrm='stale sender lease created agent message' then raise; end if;
  end;
end $$;

-- Terminal execution cancels any remaining queued/delivered bus work.
insert into mr8c_state(key,payload)
select 'terminal_message',public.leah_agent_bus_send_for_task(
  (r.payload->>'id')::uuid,(r.payload->>'lease_token')::uuid,null,'auditor','execution.end','event','{}'::jsonb,
  'terminal-message',null,null,5
) from mr8c_state r where r.key='receiver_claim';
update public.leah_executions set status='failed',ended_at=clock_timestamp(),updated_at=clock_timestamp()
where id='e8c30000-0000-4000-8000-000000000001';

do $$
declare m jsonb;
begin
  select payload into m from mr8c_state where key='terminal_message';
  if not exists(select 1 from public.leah_agent_messages where id=(m->>'id')::uuid and status='cancelled' and error_code='execution_terminal') then
    raise exception 'terminal execution did not cancel agent message';
  end if;
end $$;

rollback;
\echo 'MR8C AGENT-TO-AGENT BUS CONTRACT: PASS'
