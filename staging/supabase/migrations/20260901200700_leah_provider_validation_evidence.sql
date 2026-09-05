create table public.leah_provider_validation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  binding_id uuid not null,
  provider text not null check (provider in ('openai','anthropic','gemini','deepseek','kimi','zai')),
  model text not null check (length(trim(model)) between 1 and 200),
  status text not null check (status in ('valid','invalid','unknown')),
  provider_request_id text null check (provider_request_id is null or length(provider_request_id)<=500),
  usage_source text not null default 'unavailable' check (usage_source in ('provider','unavailable')),
  input_tokens bigint null check (input_tokens is null or input_tokens>=0),
  output_tokens bigint null check (output_tokens is null or output_tokens>=0),
  total_tokens bigint null check (total_tokens is null or total_tokens>=0),
  provider_cost_micros bigint null check (provider_cost_micros is null or provider_cost_micros>=0),
  latency_ms integer null check (latency_ms is null or latency_ms>=0),
  error_code text null check (error_code is null or length(error_code)<=120),
  created_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint leah_provider_validation_binding_fk foreign key(binding_id,workspace_id)
    references public.leah_workspace_provider_bindings(id,workspace_id) on delete cascade
);
create index leah_provider_validation_events_idx on public.leah_provider_validation_events(workspace_id,provider,created_at desc);
alter table public.leah_provider_validation_events enable row level security;
alter table public.leah_provider_validation_events force row level security;
revoke all on public.leah_provider_validation_events from public,anon,authenticated;
grant all on public.leah_provider_validation_events to service_role;

create or replace function public.leah_record_provider_validation(
  _workspace_id uuid,_user_id uuid,_provider text,_model text,_status text,
  _provider_request_id text default null,_usage_source text default 'unavailable',
  _input_tokens bigint default null,_output_tokens bigint default null,_total_tokens bigint default null,
  _latency_ms integer default null,_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _binding public.leah_workspace_provider_bindings%rowtype; _row public.leah_provider_validation_events%rowtype;
begin
  if not public.has_workspace_role_for_user(_user_id,_workspace_id,array['owner','admin']::text[]) then raise exception 'Forbidden' using errcode='42501'; end if;
  if _status not in ('valid','invalid','unknown') then raise exception 'Invalid validation status'; end if;
  if _usage_source not in ('provider','unavailable') then raise exception 'Invalid validation usage source'; end if;
  if _usage_source='unavailable' and (_input_tokens is not null or _output_tokens is not null or _total_tokens is not null) then raise exception 'Unavailable usage cannot carry token counts'; end if;
  select b.* into _binding from public.leah_workspace_provider_bindings b
  where b.workspace_id=_workspace_id and b.provider=lower(trim(_provider)) and b.status='active' for update;
  if not found or _binding.model<>trim(_model) then raise exception 'LEAH provider binding not found'; end if;
  insert into public.leah_provider_validation_events(workspace_id,binding_id,provider,model,status,provider_request_id,usage_source,input_tokens,output_tokens,total_tokens,provider_cost_micros,latency_ms,error_code,created_by)
  values(_workspace_id,_binding.id,_binding.provider,_binding.model,_status,nullif(trim(coalesce(_provider_request_id,'')),''),_usage_source,_input_tokens,_output_tokens,_total_tokens,null,_latency_ms,nullif(trim(coalesce(_error_code,'')),''),_user_id)
  returning * into _row;
  return to_jsonb(_row);
end;
$$;
revoke all on function public.leah_record_provider_validation(uuid,uuid,text,text,text,text,text,bigint,bigint,bigint,integer,text) from public,anon,authenticated;
grant execute on function public.leah_record_provider_validation(uuid,uuid,text,text,text,text,text,bigint,bigint,bigint,integer,text) to service_role;