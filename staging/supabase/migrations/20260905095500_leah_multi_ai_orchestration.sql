-- LEAH Multi-AI Orchestration
-- Provider bindings remain workspace-owned secrets. This layer adds routing policy,
-- model economics, free-quota accounting, and paid-spend approval gates.

create table public.leah_ai_model_catalog (
  provider text not null check (length(trim(provider)) between 1 and 40),
  model text not null check (length(trim(model)) between 1 and 200),
  billing_class text not null default 'paid' check (billing_class in ('free','paid')),
  input_cost_micros_per_million bigint null check (input_cost_micros_per_million is null or input_cost_micros_per_million >= 0),
  output_cost_micros_per_million bigint null check (output_cost_micros_per_million is null or output_cost_micros_per_million >= 0),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities)='array'),
  enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (provider, model)
);

alter table public.leah_workspace_provider_bindings
  add column if not exists routing_enabled boolean not null default true,
  add column if not exists routing_priority integer not null default 100,
  add column if not exists free_quota_remaining_tokens bigint not null default 0 check (free_quota_remaining_tokens >= 0),
  add column if not exists free_quota_reset_at timestamptz null,
  add column if not exists paid_approval_required boolean not null default true;

create index if not exists leah_provider_bindings_routing_idx
  on public.leah_workspace_provider_bindings(workspace_id, routing_enabled, validation_status, routing_priority);

create index if not exists leah_ai_model_catalog_routing_idx
  on public.leah_ai_model_catalog(enabled, billing_class, input_cost_micros_per_million, output_cost_micros_per_million);

create table public.leah_ai_spend_approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  logical_request_id uuid not null,
  provider text not null,
  model text not null,
  estimated_input_tokens bigint null check (estimated_input_tokens is null or estimated_input_tokens >= 0),
  estimated_output_tokens bigint null check (estimated_output_tokens is null or estimated_output_tokens >= 0),
  estimated_cost_micros bigint null check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  reason text not null default 'paid_provider_required',
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requested_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz null,
  resolved_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  unique (workspace_id, logical_request_id, provider, model)
);

alter table public.leah_ai_spend_approval_requests enable row level security;
alter table public.leah_ai_spend_approval_requests force row level security;
revoke all on public.leah_ai_spend_approval_requests from public, anon, authenticated;
grant all on public.leah_ai_spend_approval_requests to service_role;

-- Seed provider families already supported by LEAH. Model pricing is deliberately
-- left unset until an explicit catalog entry is configured, avoiding invented prices.
insert into public.leah_ai_model_catalog(provider, model, billing_class, capabilities)
values
  ('openai','gpt-4o-mini','paid','["general","text","classification"]'::jsonb),
  ('anthropic','claude-3-5-haiku','paid','["general","text","fast"]'::jsonb),
  ('gemini','gemini-2.0-flash','free','["general","text","fast"]'::jsonb),
  ('deepseek','deepseek-chat','paid','["general","text","reasoning"]'::jsonb),
  ('kimi','kimi-for-coding','paid','["coding","text"]'::jsonb),
  ('zai','glm-4.7-flash','free','["general","text","fast"]'::jsonb)
on conflict (provider, model) do nothing;

create or replace function public.leah_route_provider_for_request(
  _workspace_id uuid,
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
  _candidate record;
  _estimated_cost bigint;
  _approval_id uuid;
begin
  if _workspace_id is null or _logical_request_id is null then raise exception 'LEAH routing identifiers are required'; end if;
  if coalesce(_estimated_input_tokens,0) < 0 or coalesce(_estimated_output_tokens,0) < 0 then raise exception 'Invalid estimated token usage'; end if;

  -- 1) FREE first, but only when the workspace has configured remaining quota.
  select b.provider, b.model, b.routing_priority, 'free'::text as billing_class,
         b.free_quota_remaining_tokens, null::bigint as estimated_cost_micros,
         b.paid_approval_required
  into _candidate
  from public.leah_workspace_provider_bindings b
  join public.leah_ai_model_catalog m on m.provider=b.provider and m.model=b.model and m.enabled
  where b.workspace_id=_workspace_id
    and b.status='active'
    and b.validation_status='valid'
    and b.routing_enabled
    and m.billing_class='free'
    and b.free_quota_remaining_tokens >= coalesce(_estimated_input_tokens,0)+coalesce(_estimated_output_tokens,0)
    and (coalesce(_capability,'general')='general' or m.capabilities ? coalesce(_capability,'general'))
  order by b.routing_priority asc, b.free_quota_remaining_tokens desc, b.provider
  limit 1;

  if found then
    return jsonb_build_object(
      'decision','route',
      'provider',_candidate.provider,
      'model',_candidate.model,
      'billing_class','free',
      'estimated_cost_micros',0,
      'approval_required',false,
      'reason','free_quota_first'
    );
  end if;

  -- 2) Paid candidates are ordered by known estimated cost, then explicit priority.
  select b.provider, b.model, b.routing_priority, 'paid'::text as billing_class,
         b.free_quota_remaining_tokens,
         case
           when m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null then null
           else ceil((coalesce(_estimated_input_tokens,0)::numeric * m.input_cost_micros_per_million) / 1000000)
              + ceil((coalesce(_estimated_output_tokens,0)::numeric * m.output_cost_micros_per_million) / 1000000)
         end::bigint as estimated_cost_micros,
         b.paid_approval_required
  into _candidate
  from public.leah_workspace_provider_bindings b
  join public.leah_ai_model_catalog m on m.provider=b.provider and m.model=b.model and m.enabled
  where b.workspace_id=_workspace_id
    and b.status='active'
    and b.validation_status='valid'
    and b.routing_enabled
    and m.billing_class='paid'
    and (coalesce(_capability,'general')='general' or m.capabilities ? coalesce(_capability,'general'))
  order by
    (m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null) asc,
    case when m.input_cost_micros_per_million is null or m.output_cost_micros_per_million is null then null else
      ceil((coalesce(_estimated_input_tokens,0)::numeric * m.input_cost_micros_per_million) / 1000000)
      + ceil((coalesce(_estimated_output_tokens,0)::numeric * m.output_cost_micros_per_million) / 1000000)
    end asc,
    b.routing_priority asc,
    b.provider
  limit 1;

  if not found then
    raise exception 'LEAH_NO_PROVIDER_AVAILABLE';
  end if;

  _estimated_cost := _candidate.estimated_cost_micros;

  if _candidate.paid_approval_required then
    insert into public.leah_ai_spend_approval_requests(
      workspace_id, logical_request_id, provider, model,
      estimated_input_tokens, estimated_output_tokens, estimated_cost_micros,
      reason, metadata
    ) values (
      _workspace_id, _logical_request_id, _candidate.provider, _candidate.model,
      _estimated_input_tokens, _estimated_output_tokens, _estimated_cost,
      'paid_provider_required', jsonb_build_object('capability',coalesce(_capability,'general'))
    )
    on conflict (workspace_id, logical_request_id, provider, model) do update
      set requested_at=clock_timestamp(), status='pending', resolved_at=null, resolved_by=null
    returning id into _approval_id;

    return jsonb_build_object(
      'decision','approval_required',
      'provider',_candidate.provider,
      'model',_candidate.model,
      'billing_class','paid',
      'estimated_cost_micros',_estimated_cost,
      'approval_required',true,
      'approval_request_id',_approval_id,
      'reason','paid_ai_requires_admin_owner_approval'
    );
  end if;

  return jsonb_build_object(
    'decision','route',
    'provider',_candidate.provider,
    'model',_candidate.model,
    'billing_class','paid',
    'estimated_cost_micros',_estimated_cost,
    'approval_required',false,
    'reason','lowest_known_cost'
  );
end;
$$;

revoke all on function public.leah_route_provider_for_request(uuid,uuid,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.leah_route_provider_for_request(uuid,uuid,text,bigint,bigint) to service_role;

create or replace function public.leah_resolve_ai_spend_approval(
  _approval_id uuid,
  _workspace_id uuid,
  _user_id uuid,
  _decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare _row public.leah_ai_spend_approval_requests%rowtype;
begin
  if not public.has_workspace_role_for_user(_user_id,_workspace_id,array['owner','admin']::text[]) then raise exception 'Forbidden'; end if;
  if _decision not in ('approved','rejected') then raise exception 'Invalid approval decision'; end if;
  update public.leah_ai_spend_approval_requests
  set status=_decision, resolved_at=clock_timestamp(), resolved_by=_user_id
  where id=_approval_id and workspace_id=_workspace_id and status='pending'
  returning * into _row;
  if not found then raise exception 'LEAH approval request not found or already resolved'; end if;
  return jsonb_build_object('id',_row.id,'status',_row.status,'provider',_row.provider,'model',_row.model);
end;
$$;

revoke all on function public.leah_resolve_ai_spend_approval(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.leah_resolve_ai_spend_approval(uuid,uuid,uuid,text) to service_role;
