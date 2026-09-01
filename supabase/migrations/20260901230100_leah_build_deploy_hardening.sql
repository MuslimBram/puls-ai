-- MR8D adversarial hardening: active deployment targets require a real Vault-backed
-- credential; build/deploy evidence snapshots are immutable after admission.

create or replace function public.leah_enforce_deployment_target_credential()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare _provider text; _vault_ref uuid;
begin
  if new.status='active' then
    if new.credential_secret_id is null then raise exception 'Active deployment target requires credential'; end if;
    select lower(s.provider),s.vault_ref_id into _provider,_vault_ref
    from public.leah_secret_registry s
    where s.id=new.credential_secret_id and s.workspace_id=new.workspace_id and s.status='active';
    if not found or _vault_ref is null then raise exception 'Active deployment target requires Vault-backed credential'; end if;
    if new.provider='vercel' and _provider<>'vercel' then raise exception 'Deployment credential provider mismatch'; end if;
    if new.provider='cloudflare_pages' and _provider not in ('cloudflare','cloudflare_pages') then raise exception 'Deployment credential provider mismatch'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leah_deployment_target_credential_trigger on public.leah_deployment_targets;
create trigger leah_deployment_target_credential_trigger
before insert or update of status,credential_secret_id,provider on public.leah_deployment_targets
for each row execute function public.leah_enforce_deployment_target_credential();

create or replace function public.leah_enforce_build_snapshot_immutable()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.workspace_id<>old.workspace_id or new.project_id<>old.project_id
     or new.execution_id<>old.execution_id or new.task_id<>old.task_id
     or new.authority_lease_hash<>old.authority_lease_hash or new.build_key<>old.build_key
     or new.source_manifest<>old.source_manifest or new.source_manifest_hash<>old.source_manifest_hash
     or new.builder<>old.builder or new.builder_version is distinct from old.builder_version then
    raise exception 'LEAH build admission snapshot is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists leah_build_snapshot_immutable_trigger on public.leah_builds;
create trigger leah_build_snapshot_immutable_trigger
before update on public.leah_builds
for each row execute function public.leah_enforce_build_snapshot_immutable();

create or replace function public.leah_enforce_build_source_immutable()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'LEAH build source evidence is immutable';
end;
$$;

drop trigger if exists leah_build_source_immutable_trigger on public.leah_build_source_artifacts;
create trigger leah_build_source_immutable_trigger
before update on public.leah_build_source_artifacts
for each row execute function public.leah_enforce_build_source_immutable();

create or replace function public.leah_enforce_deployment_snapshot_truth()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  _target public.leah_deployment_targets%rowtype;
  _secret public.leah_secret_registry%rowtype;
  _build public.leah_builds%rowtype;
begin
  if tg_op='UPDATE' then
    if new.workspace_id<>old.workspace_id or new.project_id<>old.project_id or new.build_id<>old.build_id
       or new.target_id<>old.target_id or new.target_version<>old.target_version or new.provider<>old.provider
       or new.environment<>old.environment or new.provider_project_ref<>old.provider_project_ref
       or new.provider_account_ref is distinct from old.provider_account_ref
       or new.credential_secret_id<>old.credential_secret_id or new.request_key<>old.request_key
       or new.requested_execution_id<>old.requested_execution_id or new.requested_task_id<>old.requested_task_id
       or new.requested_by<>old.requested_by then
      raise exception 'LEAH deployment request snapshot is immutable';
    end if;
    if old.operation_nonce is not null and new.operation_nonce is distinct from old.operation_nonce then
      raise exception 'LEAH deployment operation nonce is immutable';
    end if;
    if old.deployment_reservation_id is not null and new.deployment_reservation_id is distinct from old.deployment_reservation_id then
      raise exception 'LEAH deployment reservation binding is immutable';
    end if;
  end if;

  if new.status in ('awaiting_approval','queued','deploying') then
    select t.* into _target from public.leah_deployment_targets t
    where t.id=new.target_id and t.workspace_id=new.workspace_id and t.project_id=new.project_id
      and t.version=new.target_version and t.status='active'
      and t.provider=new.provider and t.environment=new.environment
      and t.provider_project_ref=new.provider_project_ref
      and t.provider_account_ref is not distinct from new.provider_account_ref
      and t.credential_secret_id=new.credential_secret_id;
    if not found then raise exception 'Deployment target snapshot is stale or disabled'; end if;

    select s.* into _secret from public.leah_secret_registry s
    where s.id=new.credential_secret_id and s.workspace_id=new.workspace_id
      and s.status='active' and s.vault_ref_id is not null;
    if not found then raise exception 'Deployment credential is not Vault-backed and active'; end if;
    if new.provider='vercel' and lower(_secret.provider)<>'vercel' then raise exception 'Deployment credential provider mismatch'; end if;
    if new.provider='cloudflare_pages' and lower(_secret.provider) not in ('cloudflare','cloudflare_pages') then raise exception 'Deployment credential provider mismatch'; end if;
  end if;

  if new.environment='production' and new.status in ('queued','deploying','succeeded','failed','unknown') then
    select b.* into _build from public.leah_builds b
    where b.id=new.build_id and b.workspace_id=new.workspace_id and b.project_id=new.project_id and b.status='succeeded';
    if not found or new.approved_at is null or new.approved_by is null
       or new.approval_build_digest is distinct from _build.output_digest then
      raise exception 'Production deployment approval does not match immutable successful build';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leah_deployment_snapshot_truth_trigger on public.leah_deployments;
create trigger leah_deployment_snapshot_truth_trigger
before insert or update on public.leah_deployments
for each row execute function public.leah_enforce_deployment_snapshot_truth();

revoke all on function public.leah_enforce_deployment_target_credential() from public,anon,authenticated;
revoke all on function public.leah_enforce_build_snapshot_immutable() from public,anon,authenticated;
revoke all on function public.leah_enforce_build_source_immutable() from public,anon,authenticated;
revoke all on function public.leah_enforce_deployment_snapshot_truth() from public,anon,authenticated;
