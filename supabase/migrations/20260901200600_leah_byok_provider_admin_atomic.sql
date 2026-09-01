-- MR7-A: owner/admin BYOK credential management is transactional.
-- Plaintext enters only a service-only RPC called from Pulse Edge and is persisted in Vault.

create or replace function public.leah_save_workspace_provider(
  _workspace_id uuid,
  _user_id uuid,
  _provider text,
  _model text,
  _secret_value text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _provider_clean text := lower(trim(coalesce(_provider,'')));
  _model_clean text := trim(coalesce(_model,''));
  _alias text;
  _existing_binding public.leah_workspace_provider_bindings%rowtype;
  _existing_secret public.leah_secret_registry%rowtype;
  _secret_result jsonb;
  _secret_id uuid;
  _binding jsonb;
begin
  if not public.has_workspace_role_for_user(_user_id,_workspace_id,array['owner','admin']::text[]) then raise exception 'Forbidden' using errcode='42501'; end if;
  if _provider_clean not in ('openai','anthropic','gemini','deepseek','kimi','zai') then raise exception 'Invalid LEAH provider'; end if;
  if length(_model_clean) not between 1 and 200 then raise exception 'Invalid LEAH provider model'; end if;
  if _secret_value is null or length(_secret_value) not between 8 and 20000 then raise exception 'Invalid provider credential'; end if;
  _alias := 'byok-' || _provider_clean;

  select b.* into _existing_binding
  from public.leah_workspace_provider_bindings b
  where b.workspace_id=_workspace_id and b.provider=_provider_clean
  for update;

  if found then
    select s.* into _existing_secret
    from public.leah_secret_registry s
    where s.id=_existing_binding.secret_id and s.workspace_id=_workspace_id and s.status='active'
    for update;
  else
    select s.* into _existing_secret
    from public.leah_secret_registry s
    where s.workspace_id=_workspace_id and s.alias=_alias and s.status='active'
    for update;
  end if;

  if _existing_secret.id is not null then
    _secret_result := public.leah_vault_rotate(_workspace_id,_user_id,_existing_secret.id,_secret_value);
  else
    _secret_result := public.leah_vault_create(_workspace_id,_user_id,_alias,_provider_clean,_secret_value);
  end if;
  _secret_id := (_secret_result->>'id')::uuid;

  _binding := public.leah_bind_workspace_provider(_workspace_id,_user_id,_provider_clean,_secret_id,_model_clean);
  return _binding || jsonb_build_object('hint',_secret_result->>'hint','secret_version',(_secret_result->>'version')::integer);
end;
$$;

create or replace function public.leah_remove_workspace_provider(
  _workspace_id uuid,
  _user_id uuid,
  _provider text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _provider_clean text := lower(trim(coalesce(_provider,'')));
  _binding public.leah_workspace_provider_bindings%rowtype;
begin
  if not public.has_workspace_role_for_user(_user_id,_workspace_id,array['owner','admin']::text[]) then raise exception 'Forbidden' using errcode='42501'; end if;
  select b.* into _binding from public.leah_workspace_provider_bindings b
  where b.workspace_id=_workspace_id and b.provider=_provider_clean for update;
  if not found then return false; end if;

  perform public.leah_vault_revoke(_workspace_id,_user_id,_binding.secret_id);
  update public.leah_workspace_provider_bindings
  set status='disabled',validation_status='pending',validation_error_code=null,updated_by=_user_id,updated_at=clock_timestamp()
  where id=_binding.id and workspace_id=_workspace_id;
  return true;
end;
$$;

revoke all on function public.leah_save_workspace_provider(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.leah_remove_workspace_provider(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.leah_save_workspace_provider(uuid,uuid,text,text,text) to service_role;
grant execute on function public.leah_remove_workspace_provider(uuid,uuid,text) to service_role;