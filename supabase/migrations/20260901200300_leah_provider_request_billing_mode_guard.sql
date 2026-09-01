-- MR7-A hardening: billing_mode is fixed at logical-request admission.
-- This invariant is enforced in PostgreSQL as well as in the LEAH router so a
-- direct service-role insert or concurrent fallback cannot cross BYOK/managed.

create table public.leah_provider_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  execution_id uuid not null,
  task_id uuid not null,
  logical_request_id uuid not null,
  billing_mode text not null check (billing_mode in ('byok','managed')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, logical_request_id),
  constraint leah_provider_request_execution_fk
    foreign key (execution_id, workspace_id)
    references public.leah_executions(id, workspace_id) on delete cascade,
  constraint leah_provider_request_task_fk
    foreign key (task_id, execution_id, workspace_id)
    references public.leah_tasks(id, execution_id, workspace_id) on delete cascade
);

alter table public.leah_provider_requests enable row level security;
alter table public.leah_provider_requests force row level security;
revoke all on public.leah_provider_requests from public, anon, authenticated;
grant all on public.leah_provider_requests to service_role;

create or replace function public.leah_enforce_provider_request_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _request public.leah_provider_requests%rowtype;
begin
  insert into public.leah_provider_requests(
    workspace_id, execution_id, task_id, logical_request_id, billing_mode
  ) values (
    new.workspace_id, new.execution_id, new.task_id, new.logical_request_id, new.billing_mode
  )
  on conflict (workspace_id, logical_request_id) do nothing;

  select r.* into _request
  from public.leah_provider_requests r
  where r.workspace_id=new.workspace_id
    and r.logical_request_id=new.logical_request_id
  for update;

  if not found then raise exception 'LEAH_PROVIDER_REQUEST_ADMISSION_FAILED'; end if;
  if _request.execution_id<>new.execution_id
     or _request.task_id<>new.task_id
     or _request.billing_mode<>new.billing_mode then
    raise exception 'LEAH_PROVIDER_REQUEST_CONFLICT';
  end if;

  return new;
end;
$$;

revoke all on function public.leah_enforce_provider_request_mode() from public, anon, authenticated;
grant execute on function public.leah_enforce_provider_request_mode() to service_role;

create trigger leah_provider_attempt_request_mode_guard
before insert on public.leah_provider_attempts
for each row execute function public.leah_enforce_provider_request_mode();
