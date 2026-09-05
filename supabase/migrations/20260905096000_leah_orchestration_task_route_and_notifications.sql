-- Secure task-scoped routing wrapper. Workspace identity is derived from the leased task,
-- so callers cannot choose another workspace for routing.
create or replace function public.leah_route_provider_for_task(
  _task_id uuid,
  _lease_token uuid,
  _logical_request_id uuid,
  _capability text default 'general',
  _estimated_input_tokens bigint default 0,
  _estimated_output_tokens bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _workspace_id uuid;
  _execution_id uuid;
  _now timestamptz := clock_timestamp();
begin
  select t.workspace_id, t.execution_id into _workspace_id, _execution_id
  from public.leah_tasks t
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token and t.lease_expires_at>_now;
  if _workspace_id is null then raise exception 'Task lease invalid or expired'; end if;

  return public.leah_route_provider_for_request(
    _workspace_id,
    _logical_request_id,
    _capability,
    _estimated_input_tokens,
    _estimated_output_tokens
  );
end;
$$;

revoke all on function public.leah_route_provider_for_task(uuid,uuid,uuid,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.leah_route_provider_for_task(uuid,uuid,uuid,text,bigint,bigint) to service_role;

-- Approval requests become visible immediately to the workspace owner and admins.
create or replace function public.leah_notify_paid_ai_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _workspace_name text;
  _title text;
  _message text;
  _action_url text;
begin
  select w.name into _workspace_name from public.workspaces w where w.id=NEW.workspace_id;
  _title := 'LEAH AI payment approval required';
  _message := format(
    'LEAH needs approval to use %s / %s for a request in workspace %s. Estimated cost: %s micros.',
    NEW.provider, NEW.model, coalesce(_workspace_name,'workspace'), coalesce(NEW.estimated_cost_micros::text,'unknown')
  );
  _action_url := '/leah/provider-settings?approval=' || NEW.id::text;

  insert into public.business_notifications(user_id,workspace_id,notification_type,category,title,message,metadata,action_url)
  select wm.user_id, NEW.workspace_id, 'warning', 'leah_ai_spend', _title, _message,
         jsonb_build_object(
           'approval_request_id',NEW.id,
           'provider',NEW.provider,
           'model',NEW.model,
           'estimated_cost_micros',NEW.estimated_cost_micros
         ), _action_url
  from public.workspace_members wm
  where wm.workspace_id=NEW.workspace_id and wm.role in ('owner','admin');

  -- The workspace owner may not be duplicated in workspace_members on older data.
  insert into public.business_notifications(user_id,workspace_id,notification_type,category,title,message,metadata,action_url)
  select w.owner_id, NEW.workspace_id, 'warning', 'leah_ai_spend', _title, _message,
         jsonb_build_object(
           'approval_request_id',NEW.id,
           'provider',NEW.provider,
           'model',NEW.model,
           'estimated_cost_micros',NEW.estimated_cost_micros
         ), _action_url
  from public.workspaces w
  where w.id=NEW.workspace_id
    and not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id=NEW.workspace_id and wm.user_id=w.owner_id and wm.role in ('owner','admin')
    );

  return NEW;
end;
$$;

revoke all on function public.leah_notify_paid_ai_approval() from public, anon, authenticated;
grant execute on function public.leah_notify_paid_ai_approval() to service_role;

drop trigger if exists leah_paid_ai_approval_notification on public.leah_ai_spend_approval_requests;
create trigger leah_paid_ai_approval_notification
after insert on public.leah_ai_spend_approval_requests
for each row execute function public.leah_notify_paid_ai_approval();
