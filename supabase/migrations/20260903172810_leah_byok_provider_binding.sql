-- MR7-A BYOK provider binding.
-- A provider credential is selected by the task's authoritative workspace and active
-- binding. Workers never supply workspace_id, user_id, secret_id, base_url or raw key.

create table public.leah_workspace_provider_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini','deepseek','kimi','zai')),
  secret_id uuid not null,
  model text not null check (length(trim(model)) between 1 and 200),
  status text not null default 'active' check (status in ('active','disabled')),
  last_validated_at timestamptz null,
  validation_status text not null default 'pending' check (validation_status in ('pending','valid','invalid')),
  validation_error_code text null check (validation_error_code is null or length(validation_error_code) <= 120),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, workspace_id),
  unique (workspace_id, provider),
  constraint leah_workspace_provider_binding_secret_fk
    foreign key (secret_id, workspace_id)
    references public.leah_secret_registry(id, workspace_id)
    on delete restrict
);

alter table public.leah_workspace_provider_bindings enable row level security;
alter table public.leah_workspace_provider_bindings force row level security;
revoke all on public.leah_workspace_provider_bindings from public, anon, authenticated;
grant all on public.leah_workspace_provider_bindings to service_role;

create or replace function public.leah_bind_workspace_provider(
  _workspace_id uuid,
  _user_id uuid,
  _provider text,
  _secret_id uuid,
  _model text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _secret public.leah_secret_registry%rowtype;
  _row public.leah_workspace_provider_bindings%rowtype;
  _provider_clean text := lower(trim(coalesce(_provider,'')));
  _model_clean text := trim(coalesce(_model,''));
begin
  if not public.has_workspace_role_for_user(_user_id, _workspace_id, array['owner','admin']::text[]) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if _provider_clean not in ('openai','anthropic','gemini','deepseek','kimi','zai') then raise exception 'Invalid LEAH provider'; end if;
  if length(_model_clean) not between 1 and 200 then raise exception 'Invalid LEAH provider model'; end if;

  select s.* into _secret
  from public.leah_secret_registry s
  where s.id=_secret_id and s.workspace_id=_workspace_id and s.status='active'
  for update;
  if not found then raise exception 'Secret unavailable' using errcode='42501'; end if;
  if lower(trim(_secret.provider)) <> _provider_clean then raise exception 'Provider secret mismatch'; end if;

  insert into public.leah_workspace_provider_bindings(
    workspace_id,provider,secret_id,model,status,validation_status,validation_error_code,
    created_by,updated_by,created_at,updated_at
  ) values (
    _workspace_id,_provider_clean,_secret.id,_model_clean,'active','pending',null,
    _user_id,_user_id,clock_timestamp(),clock_timestamp()
  )
  on conflict (workspace_id,provider) do update
  set secret_id=excluded.secret_id,
      model=excluded.model,
      status='active',
      validation_status='pending',
      validation_error_code=null,
      updated_by=_user_id,
      updated_at=clock_timestamp()
  returning * into _row;

  return jsonb_build_object(
    'id',_row.id,'provider',_row.provider,'model',_row.model,'status',_row.status,
    'validation_status',_row.validation_status,'last_validated_at',_row.last_validated_at
  );
end;
$$;

create or replace function public.leah_set_workspace_provider_validation(
  _workspace_id uuid,
  _provider text,
  _status text,
  _error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare _row public.leah_workspace_provider_bindings%rowtype;
begin
  if _status not in ('valid','invalid') then raise exception 'Invalid provider validation status'; end if;
  if _error_code is not null and length(_error_code)>120 then raise exception 'Invalid provider validation error code'; end if;
  update public.leah_workspace_provider_bindings
  set validation_status=_status,
      validation_error_code=nullif(trim(coalesce(_error_code,'')),''),
      last_validated_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where workspace_id=_workspace_id and provider=lower(trim(_provider)) and status='active'
  returning * into _row;
  if not found then raise exception 'LEAH provider binding not found'; end if;
  return jsonb_build_object('provider',_row.provider,'model',_row.model,'validation_status',_row.validation_status,'last_validated_at',_row.last_validated_at);
end;
$$;

create or replace function public.leah_resolve_byok_provider_for_task(
  _task_id uuid,
  _lease_token uuid,
  _provider text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _task public.leah_tasks%rowtype;
  _execution public.leah_executions%rowtype;
  _ent public.leah_workspace_entitlements%rowtype;
  _binding public.leah_workspace_provider_bindings%rowtype;
  _secret public.leah_secret_registry%rowtype;
  _vault_name text;
  _secret_value text;
  _provider_clean text := lower(trim(coalesce(_provider,'')));
  _now timestamptz := clock_timestamp();
begin
  if _task_id is null or _lease_token is null then raise exception 'Task lease authority required'; end if;
  if _provider_clean not in ('openai','anthropic','gemini','deepseek','kimi','zai') then raise exception 'Invalid LEAH provider'; end if;

  select t.* into _task
  from public.leah_tasks t
  where t.id=_task_id and t.status='running' and t.lease_token=_lease_token and t.lease_expires_at>_now
  for update;
  if not found then raise exception 'Task lease invalid or expired'; end if;

  select x.* into _execution
  from public.leah_executions x
  where x.id=_task.execution_id and x.workspace_id=_task.workspace_id and x.status='running'
  for share;
  if not found then raise exception 'Execution not running'; end if;

  select e.* into _ent
  from public.leah_workspace_entitlements e
  where e.workspace_id=_task.workspace_id
  for share;
  if not found or _ent.status not in ('trial','active','grace')
     or (_ent.valid_until is not null and _ent.valid_until<=_now) then raise exception 'LEAH entitlement inactive'; end if;
  if _ent.ai_funding_mode not in ('byok','hybrid') then raise exception 'LEAH_BYOK_DISABLED'; end if;

  select b.* into _binding
  from public.leah_workspace_provider_bindings b
  where b.workspace_id=_task.workspace_id and b.provider=_provider_clean and b.status='active'
  for share;
  if not found then raise exception 'LEAH provider binding unavailable'; end if;

  select s.* into _secret
  from public.leah_secret_registry s
  where s.id=_binding.secret_id and s.workspace_id=_task.workspace_id and s.status='active'
  for share;
  if not found or _secret.vault_ref_id is null or lower(trim(_secret.provider))<>_provider_clean then
    raise exception 'Secret unavailable' using errcode='42501';
  end if;

  select r.vault_secret_name into _vault_name
  from public.vault_secret_refs r
  where r.id=_secret.vault_ref_id and r.workspace_id=_task.workspace_id;
  if _vault_name is null then raise exception 'Secret unavailable' using errcode='42501'; end if;

  select d.decrypted_secret into _secret_value
  from vault.decrypted_secrets d
  where d.name=_vault_name
  limit 1;
  if _secret_value is null then raise exception 'Secret unavailable' using errcode='42501'; end if;

  insert into public.leah_secret_access_log(workspace_id,secret_id,execution_id,actor_id,action,metadata)
  values(_task.workspace_id,_secret.id,_task.execution_id,_execution.requested_by,'use',jsonb_build_object('provider',_provider_clean,'task_id',_task.id));

  return jsonb_build_object(
    'workspace_id',_task.workspace_id,
    'execution_id',_task.execution_id,
    'task_id',_task.id,
    'requested_by',_execution.requested_by,
    'provider',_binding.provider,
    'model',_binding.model,
    'secret_id',_secret.id,
    'secret_value',_secret_value
  );
end;
$$;

revoke all on function public.leah_bind_workspace_provider(uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.leah_set_workspace_provider_validation(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.leah_resolve_byok_provider_for_task(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.leah_bind_workspace_provider(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.leah_set_workspace_provider_validation(uuid,text,text,text) to service_role;
grant execute on function public.leah_resolve_byok_provider_for_task(uuid,uuid,text) to service_role;;
