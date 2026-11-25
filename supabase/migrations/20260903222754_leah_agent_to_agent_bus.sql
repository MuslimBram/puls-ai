-- MR8C — LEAH durable Agent-to-Agent communication bus.
-- Messages are durable, execution-bound, sender-lease-authorized and delivered
-- at-least-once with explicit delivery tokens + idempotent sends.

create table public.leah_agent_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  execution_id uuid not null,
  sender_task_id uuid not null,
  sender_agent_role text not null check (length(trim(sender_agent_role)) between 1 and 80),
  recipient_task_id uuid null,
  recipient_agent_role text null,
  delivered_to_task_id uuid null,
  topic text not null check (length(trim(topic)) between 1 and 160),
  kind text not null check (kind in ('command','event','request','response')),
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  reply_to_id uuid null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  status text not null default 'queued'
    check (status in ('queued','delivered','acked','dead_letter','cancelled')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  max_delivery_attempts integer not null default 5 check (max_delivery_attempts between 1 and 20),
  delivery_token uuid null,
  delivery_expires_at timestamptz null,
  available_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz null,
  acked_at timestamptz null,
  error_code text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (id, execution_id, workspace_id),
  unique (workspace_id, sender_task_id, idempotency_key),
  constraint leah_agent_message_execution_fk
    foreign key (execution_id, project_id, workspace_id)
    references public.leah_executions(id, project_id, workspace_id) on delete cascade,
  constraint leah_agent_message_sender_task_fk
    foreign key (sender_task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_agent_message_recipient_task_fk
    foreign key (recipient_task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade,
  constraint leah_agent_message_delivered_task_fk
    foreign key (delivered_to_task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete set null (delivered_to_task_id),
  constraint leah_agent_message_reply_fk
    foreign key (reply_to_id, execution_id, workspace_id)
    references public.leah_agent_messages(id, execution_id, workspace_id) on delete set null (reply_to_id),
  constraint leah_agent_message_target_shape_ck check (
    (recipient_task_id is not null and recipient_agent_role is null)
    or (recipient_task_id is null and recipient_agent_role is not null and length(trim(recipient_agent_role)) between 1 and 80)
  ),
  constraint leah_agent_message_response_shape_ck check (kind <> 'response' or reply_to_id is not null),
  constraint leah_agent_message_payload_size_ck check (octet_length(payload::text) <= 131072),
  constraint leah_agent_message_expiry_ck check (expires_at is null or expires_at > created_at),
  constraint leah_agent_message_delivery_shape_ck check (
    (status='queued' and delivery_token is null and delivery_expires_at is null and acked_at is null)
    or (status='delivered' and delivery_token is not null and delivery_expires_at is not null and delivered_to_task_id is not null and acked_at is null)
    or (status='acked' and delivery_token is null and delivery_expires_at is null and delivered_to_task_id is not null and acked_at is not null)
    or (status in ('dead_letter','cancelled') and delivery_token is null and delivery_expires_at is null and acked_at is null)
  )
);

create index leah_agent_messages_receive_idx
  on public.leah_agent_messages(execution_id,status,available_at,created_at)
  where status in ('queued','delivered');
create index leah_agent_messages_task_target_idx
  on public.leah_agent_messages(workspace_id,execution_id,recipient_task_id,status,created_at)
  where recipient_task_id is not null;
create index leah_agent_messages_role_target_idx
  on public.leah_agent_messages(workspace_id,execution_id,recipient_agent_role,status,created_at)
  where recipient_agent_role is not null;
create index leah_agent_messages_correlation_idx
  on public.leah_agent_messages(workspace_id,execution_id,correlation_id,created_at);
create index leah_agent_messages_delivery_expiry_idx
  on public.leah_agent_messages(delivery_expires_at)
  where status='delivered';

alter table public.leah_agent_messages enable row level security;
alter table public.leah_agent_messages force row level security;
revoke all on public.leah_agent_messages from public,anon,authenticated;
grant all on public.leah_agent_messages to service_role;

create or replace function public.leah_agent_bus_require_task(
  _task_id uuid,
  _lease_token uuid
)
returns public.leah_tasks
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype;
begin
  select t.* into _task
  from public.leah_tasks t
  join public.leah_executions e
    on e.id=t.execution_id and e.workspace_id=t.workspace_id
  where t.id=_task_id
    and t.status='running'
    and t.lease_token=_lease_token
    and t.lease_expires_at > clock_timestamp()
    and e.status='running'
  for update of t;
  if not found then raise exception 'Task lease invalid or expired'; end if;
  return _task;
end;
$$;

create or replace function public.leah_agent_bus_send_for_task(
  _task_id uuid,
  _lease_token uuid,
  _recipient_task_id uuid,
  _recipient_agent_role text,
  _topic text,
  _kind text,
  _payload jsonb,
  _idempotency_key text,
  _reply_to_id uuid default null,
  _expires_at timestamptz default null,
  _max_delivery_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _task public.leah_tasks%rowtype;
  _target public.leah_tasks%rowtype;
  _parent public.leah_agent_messages%rowtype;
  _existing public.leah_agent_messages%rowtype;
  _message public.leah_agent_messages%rowtype;
  _correlation uuid := gen_random_uuid();
  _payload_value jsonb := coalesce(_payload,'{}'::jsonb);
begin
  _task := public.leah_agent_bus_require_task(_task_id,_lease_token);

  if (_recipient_task_id is null) = (_recipient_agent_role is null) then
    raise exception 'Exactly one agent-bus recipient target is required';
  end if;
  if _recipient_agent_role is not null and (length(trim(_recipient_agent_role)) < 1 or length(trim(_recipient_agent_role)) > 80) then
    raise exception 'Invalid recipient agent role';
  end if;
  if _topic is null or length(trim(_topic)) < 1 or length(trim(_topic)) > 160 then raise exception 'Invalid agent-bus topic'; end if;
  if _kind not in ('command','event','request','response') then raise exception 'Invalid agent-bus kind'; end if;
  if _idempotency_key is null or length(trim(_idempotency_key)) < 1 or length(trim(_idempotency_key)) > 200 then
    raise exception 'Invalid agent-bus idempotency key';
  end if;
  if octet_length(_payload_value::text) > 131072 then raise exception 'Agent-bus payload exceeds 128 KB'; end if;
  if _expires_at is not null and _expires_at <= clock_timestamp() then raise exception 'Agent-bus expiry must be in the future'; end if;
  if _max_delivery_attempts < 1 or _max_delivery_attempts > 20 then raise exception 'Invalid max delivery attempts'; end if;

  if _recipient_task_id is not null then
    select t.* into _target
    from public.leah_tasks t
    where t.id=_recipient_task_id
      and t.workspace_id=_task.workspace_id
      and t.execution_id=_task.execution_id
      and t.project_id=_task.project_id
      and t.status in ('queued','running','retry_wait')
    for share;
    if not found then raise exception 'Agent-bus recipient task unavailable or cross-execution'; end if;
  end if;

  if _kind='response' and _reply_to_id is null then raise exception 'Agent-bus response requires reply_to_id'; end if;
  if _reply_to_id is not null then
    select m.* into _parent
    from public.leah_agent_messages m
    where m.id=_reply_to_id
      and m.workspace_id=_task.workspace_id
      and m.execution_id=_task.execution_id;
    if not found then raise exception 'Agent-bus reply parent not found in execution'; end if;
    _correlation := _parent.correlation_id;
    if _kind='response' then
      if _recipient_task_id is not null and _recipient_task_id <> _parent.sender_task_id then
        raise exception 'Agent-bus response recipient must match request sender task';
      end if;
      if _recipient_agent_role is not null and trim(_recipient_agent_role) <> _parent.sender_agent_role then
        raise exception 'Agent-bus response recipient role must match request sender role';
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_task.workspace_id::text || ':' || _task.id::text || ':' || trim(_idempotency_key),0));

  select m.* into _existing
  from public.leah_agent_messages m
  where m.workspace_id=_task.workspace_id
    and m.sender_task_id=_task.id
    and m.idempotency_key=trim(_idempotency_key);
  if found then
    if _existing.execution_id <> _task.execution_id
       or _existing.recipient_task_id is distinct from _recipient_task_id
       or _existing.recipient_agent_role is distinct from (case when _recipient_agent_role is null then null else trim(_recipient_agent_role) end)
       or _existing.topic <> trim(_topic)
       or _existing.kind <> _kind
       or _existing.payload <> _payload_value
       or _existing.reply_to_id is distinct from _reply_to_id
       or _existing.expires_at is distinct from _expires_at
       or _existing.max_delivery_attempts <> _max_delivery_attempts then
      raise exception 'Agent-bus idempotency conflict';
    end if;
    return (to_jsonb(_existing) - 'delivery_token') || jsonb_build_object('idempotent_replay',true);
  end if;

  insert into public.leah_agent_messages(
    workspace_id,project_id,execution_id,sender_task_id,sender_agent_role,
    recipient_task_id,recipient_agent_role,topic,kind,payload,correlation_id,
    reply_to_id,idempotency_key,expires_at,max_delivery_attempts
  ) values (
    _task.workspace_id,_task.project_id,_task.execution_id,_task.id,_task.agent_role,
    _recipient_task_id,case when _recipient_agent_role is null then null else trim(_recipient_agent_role) end,
    trim(_topic),_kind,_payload_value,_correlation,_reply_to_id,trim(_idempotency_key),
    _expires_at,_max_delivery_attempts
  ) returning * into _message;

  return (to_jsonb(_message) - 'delivery_token') || jsonb_build_object('idempotent_replay',false);
end;
$$;

create or replace function public.leah_agent_bus_reap(_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _expired integer:=0; _requeued integer:=0; _dead integer:=0;
begin
  if _limit < 1 or _limit > 5000 then raise exception 'Invalid agent-bus reap limit'; end if;

  with target as (
    select id,workspace_id from public.leah_agent_messages
    where status in ('queued','delivered') and expires_at is not null and expires_at <= clock_timestamp()
    order by expires_at for update skip locked limit _limit
  )
  update public.leah_agent_messages m
  set status='dead_letter',delivery_token=null,delivery_expires_at=null,
      error_code='message_expired',updated_at=clock_timestamp()
  from target t where m.id=t.id and m.workspace_id=t.workspace_id;
  get diagnostics _expired=row_count;

  with target as (
    select id,workspace_id from public.leah_agent_messages
    where status='delivered' and delivery_expires_at <= clock_timestamp()
      and delivery_attempts < max_delivery_attempts
    order by delivery_expires_at for update skip locked limit _limit
  )
  update public.leah_agent_messages m
  set status='queued',delivery_token=null,delivery_expires_at=null,delivered_to_task_id=null,
      available_at=clock_timestamp(),error_code='delivery_timeout',updated_at=clock_timestamp()
  from target t where m.id=t.id and m.workspace_id=t.workspace_id;
  get diagnostics _requeued=row_count;

  with target as (
    select id,workspace_id from public.leah_agent_messages
    where status='delivered' and delivery_expires_at <= clock_timestamp()
      and delivery_attempts >= max_delivery_attempts
    order by delivery_expires_at for update skip locked limit _limit
  )
  update public.leah_agent_messages m
  set status='dead_letter',delivery_token=null,delivery_expires_at=null,
      error_code='delivery_attempts_exhausted',updated_at=clock_timestamp()
  from target t where m.id=t.id and m.workspace_id=t.workspace_id;
  get diagnostics _dead=row_count;

  return jsonb_build_object('expired',_expired,'requeued',_requeued,'dead_lettered',_dead);
end;
$$;

create or replace function public.leah_agent_bus_receive_for_task(
  _task_id uuid,
  _lease_token uuid,
  _limit integer default 10,
  _delivery_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype; _result jsonb;
begin
  if _limit < 1 or _limit > 50 then raise exception 'Invalid agent-bus receive limit'; end if;
  if _delivery_seconds < 15 or _delivery_seconds > 900 then raise exception 'Invalid agent-bus delivery lease'; end if;
  _task := public.leah_agent_bus_require_task(_task_id,_lease_token);

  perform public.leah_agent_bus_reap(500);

  with candidates as (
    select m.id,m.workspace_id
    from public.leah_agent_messages m
    where m.workspace_id=_task.workspace_id
      and m.execution_id=_task.execution_id
      and m.project_id=_task.project_id
      and m.status='queued'
      and m.available_at <= clock_timestamp()
      and (m.expires_at is null or m.expires_at > clock_timestamp())
      and (
        m.recipient_task_id=_task.id
        or (m.recipient_task_id is null and m.recipient_agent_role=_task.agent_role)
      )
    order by m.created_at,m.id
    for update skip locked
    limit _limit
  ), delivered as (
    update public.leah_agent_messages m
    set status='delivered',delivery_attempts=m.delivery_attempts+1,
        delivery_token=gen_random_uuid(),
        delivery_expires_at=clock_timestamp()+make_interval(secs=>_delivery_seconds),
        delivered_to_task_id=_task.id,error_code=null,updated_at=clock_timestamp()
    from candidates c
    where m.id=c.id and m.workspace_id=c.workspace_id
    returning m.*
  )
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id),'[]'::jsonb)
  into _result from delivered d;
  return _result;
end;
$$;

create or replace function public.leah_agent_bus_ack_for_task(
  _task_id uuid,
  _lease_token uuid,
  _message_id uuid,
  _delivery_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype; _message public.leah_agent_messages%rowtype;
begin
  _task := public.leah_agent_bus_require_task(_task_id,_lease_token);
  update public.leah_agent_messages m
  set status='acked',delivery_token=null,delivery_expires_at=null,acked_at=clock_timestamp(),
      error_code=null,updated_at=clock_timestamp()
  where m.id=_message_id
    and m.workspace_id=_task.workspace_id
    and m.execution_id=_task.execution_id
    and m.status='delivered'
    and m.delivered_to_task_id=_task.id
    and m.delivery_token=_delivery_token
    and m.delivery_expires_at > clock_timestamp()
  returning * into _message;
  if not found then raise exception 'Agent-bus delivery token invalid or expired'; end if;
  return to_jsonb(_message) - 'delivery_token';
end;
$$;

create or replace function public.leah_agent_bus_fail_for_task(
  _task_id uuid,
  _lease_token uuid,
  _message_id uuid,
  _delivery_token uuid,
  _retryable boolean,
  _error_code text,
  _retry_delay_ms integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _task public.leah_tasks%rowtype; _message public.leah_agent_messages%rowtype; _next text;
begin
  if _retry_delay_ms < 0 or _retry_delay_ms > 86400000 then raise exception 'Invalid agent-bus retry delay'; end if;
  if _error_code is null or length(trim(_error_code)) < 1 or length(trim(_error_code)) > 120 then raise exception 'Invalid agent-bus error code'; end if;
  _task := public.leah_agent_bus_require_task(_task_id,_lease_token);
  select m.* into _message from public.leah_agent_messages m
  where m.id=_message_id and m.workspace_id=_task.workspace_id and m.execution_id=_task.execution_id
    and m.status='delivered' and m.delivered_to_task_id=_task.id
    and m.delivery_token=_delivery_token and m.delivery_expires_at > clock_timestamp()
  for update;
  if not found then raise exception 'Agent-bus delivery token invalid or expired'; end if;

  _next := case when _retryable and _message.delivery_attempts < _message.max_delivery_attempts then 'queued' else 'dead_letter' end;
  update public.leah_agent_messages m
  set status=_next,delivery_token=null,delivery_expires_at=null,
      delivered_to_task_id=case when _next='queued' then null else m.delivered_to_task_id end,
      available_at=case when _next='queued' then clock_timestamp()+make_interval(secs=>_retry_delay_ms/1000.0) else m.available_at end,
      error_code=left(trim(_error_code),120),updated_at=clock_timestamp()
  where m.id=_message.id and m.workspace_id=_message.workspace_id
  returning * into _message;
  return to_jsonb(_message) - 'delivery_token';
end;
$$;

create or replace function public.leah_agent_bus_cancel_execution_messages()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status in ('succeeded','failed','cancelled') and old.status is distinct from new.status then
    update public.leah_agent_messages m
    set status='cancelled',delivery_token=null,delivery_expires_at=null,
        error_code='execution_terminal',updated_at=clock_timestamp()
    where m.execution_id=new.id and m.workspace_id=new.workspace_id
      and m.status in ('queued','delivered');
  end if;
  return new;
end;
$$;

drop trigger if exists leah_agent_bus_execution_terminal_trigger on public.leah_executions;
create trigger leah_agent_bus_execution_terminal_trigger
after update of status on public.leah_executions
for each row execute function public.leah_agent_bus_cancel_execution_messages();

create or replace function public.leah_agent_bus_cancel_terminal_task_target()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.status in ('succeeded','failed','cancelled') and old.status is distinct from new.status then
    update public.leah_agent_messages m
    set status='cancelled',delivery_token=null,delivery_expires_at=null,
        error_code='recipient_task_terminal',updated_at=clock_timestamp()
    where m.recipient_task_id=new.id and m.workspace_id=new.workspace_id
      and m.execution_id=new.execution_id and m.status in ('queued','delivered');
  end if;
  return new;
end;
$$;

drop trigger if exists leah_agent_bus_task_terminal_trigger on public.leah_tasks;
create trigger leah_agent_bus_task_terminal_trigger
after update of status on public.leah_tasks
for each row execute function public.leah_agent_bus_cancel_terminal_task_target();

revoke all on function public.leah_agent_bus_require_task(uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_send_for_task(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,timestamptz,integer) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_reap(integer) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_receive_for_task(uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_ack_for_task(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_fail_for_task(uuid,uuid,uuid,uuid,boolean,text,integer) from public,anon,authenticated;
revoke all on function public.leah_agent_bus_cancel_execution_messages() from public,anon,authenticated;
revoke all on function public.leah_agent_bus_cancel_terminal_task_target() from public,anon,authenticated;

grant execute on function public.leah_agent_bus_require_task(uuid,uuid) to service_role;
grant execute on function public.leah_agent_bus_send_for_task(uuid,uuid,uuid,text,text,text,jsonb,text,uuid,timestamptz,integer) to service_role;
grant execute on function public.leah_agent_bus_reap(integer) to service_role;
grant execute on function public.leah_agent_bus_receive_for_task(uuid,uuid,integer,integer) to service_role;
grant execute on function public.leah_agent_bus_ack_for_task(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.leah_agent_bus_fail_for_task(uuid,uuid,uuid,uuid,boolean,text,integer) to service_role;;
