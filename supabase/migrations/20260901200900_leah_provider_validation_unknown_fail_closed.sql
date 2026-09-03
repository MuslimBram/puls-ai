-- MR7-A: provider validation evidence is authoritative for runtime eligibility.
-- Any ambiguous Test Connection (`unknown`) immediately becomes `pending`, removing
-- the binding from the runtime catalog until a later real validation succeeds.
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
declare
  _row public.leah_workspace_provider_bindings%rowtype;
begin
  if _status not in ('pending','valid','invalid') then
    raise exception 'Invalid provider validation status';
  end if;
  if _error_code is not null and length(_error_code)>120 then
    raise exception 'Invalid provider validation error code';
  end if;

  update public.leah_workspace_provider_bindings
  set validation_status=_status,
      validation_error_code=nullif(trim(coalesce(_error_code,'')),''),
      last_validated_at=clock_timestamp(),
      updated_at=clock_timestamp()
  where workspace_id=_workspace_id
    and provider=lower(trim(_provider))
    and status='active'
  returning * into _row;

  if not found then raise exception 'LEAH provider binding not found'; end if;

  return jsonb_build_object(
    'provider',_row.provider,
    'model',_row.model,
    'validation_status',_row.validation_status,
    'validation_error_code',_row.validation_error_code,
    'last_validated_at',_row.last_validated_at
  );
end;
$$;

revoke all on function public.leah_set_workspace_provider_validation(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.leah_set_workspace_provider_validation(uuid,text,text,text)
  to service_role;

create or replace function public.leah_apply_provider_validation_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.leah_workspace_provider_bindings b
  set validation_status = case
        when new.status='valid' then 'valid'
        when new.status='invalid' then 'invalid'
        else 'pending'
      end,
      validation_error_code = new.error_code,
      last_validated_at = new.created_at,
      updated_at = clock_timestamp()
  where b.id=new.binding_id
    and b.workspace_id=new.workspace_id
    and b.provider=new.provider
    and b.model=new.model
    and b.status='active';

  if not found then
    raise exception 'LEAH provider binding changed during validation';
  end if;
  return new;
end;
$$;

revoke all on function public.leah_apply_provider_validation_evidence()
  from public,anon,authenticated;
grant execute on function public.leah_apply_provider_validation_evidence() to service_role;

drop trigger if exists leah_provider_validation_evidence_state on public.leah_provider_validation_events;
create trigger leah_provider_validation_evidence_state
after insert on public.leah_provider_validation_events
for each row execute function public.leah_apply_provider_validation_evidence();