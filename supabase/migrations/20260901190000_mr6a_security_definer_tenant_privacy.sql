-- MR6-A: narrow SECURITY DEFINER caller binding + tenant privacy closure.
-- Live Production triage on 2026-09-01 found 0 anon-executable and 37
-- authenticated-executable SECURITY DEFINER functions. This migration does NOT
-- blanket-revoke that surface. It hardens only functions proven to be trigger-only,
-- backend-only, or missing caller/workspace binding.

begin;

-- ---------------------------------------------------------------------------
-- 1. Caller-bound user/workspace helpers that must remain usable by the UI.
-- ---------------------------------------------------------------------------

create or replace function public.check_business_creation_limit(_user_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  _is_admin boolean := false;
  _is_freelancer boolean := false;
  _is_collaborator boolean := false;
  _sub record;
  _existing_count int;
  _max_businesses int;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and _user_id is distinct from auth.uid() then
    raise exception 'BUSINESS_LIMIT_SUBJECT_FORBIDDEN' using errcode = '42501';
  end if;

  select exists(select 1 from public.user_roles where user_id = _user_id and role in ('admin', 'super_admin')) into _is_admin;
  select exists(select 1 from public.user_roles where user_id = _user_id and role = 'freelancer') into _is_freelancer;
  select exists(select 1 from public.user_roles where user_id = _user_id and role = 'collaborator') into _is_collaborator;

  if _is_admin then
    return jsonb_build_object('allowed', true, 'reason', 'Admin: unlimited');
  end if;

  if _is_collaborator and not _is_freelancer then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'Collaborators cannot create businesses. You can only access businesses you are assigned to.'
    );
  end if;

  select * into _sub from public.subscriptions where user_id = _user_id limit 1;
  select count(*) into _existing_count from public.business_profiles where user_id = _user_id;

  if _sub is not null and _sub.payment_status = 'trial' then
    if _existing_count >= 1 then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'During trial you can create only 1 business. Please choose a plan to create more.',
        'current_count', _existing_count
      );
    end if;
    return jsonb_build_object('allowed', true, 'reason', 'Trial: 1 business allowed');
  end if;

  if _is_freelancer then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'Freelancer: requires separate package purchase per business',
      'requires_package', true
    );
  end if;

  if _sub is not null and _sub.payment_status in ('active', 'paid') then
    select coalesce((ps.feature_entitlements->>'maxBusinesses')::int, 1)
    into _max_businesses
    from public.pricing_settings ps
    where ps.plan_key = coalesce(_sub.plan, 'standard') and ps.is_donation = false
    limit 1;

    if _existing_count >= coalesce(_max_businesses, 1) then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'Business limit reached for your plan. Please upgrade.',
        'current_count', _existing_count,
        'max_allowed', _max_businesses
      );
    end if;
    return jsonb_build_object(
      'allowed', true,
      'current_count', _existing_count,
      'max_allowed', _max_businesses
    );
  end if;

  return jsonb_build_object('allowed', false, 'reason', 'Active subscription required to create a business.');
end;
$$;

revoke execute on function public.check_business_creation_limit(uuid) from public, anon;
grant execute on function public.check_business_creation_limit(uuid) to authenticated, service_role;

create or replace function public.check_channel_business_ownership(_user_id uuid, _business_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select (
    coalesce(auth.role(), '') = 'service_role'
    or coalesce(_user_id = auth.uid(), false)
  ) and (
    exists (
      select 1 from public.business_profiles
      where id = _business_id and user_id = _user_id
    )
    or exists (
      select 1 from public.user_roles
      where user_id = _user_id and role in ('admin', 'super_admin')
    )
  );
$$;

revoke execute on function public.check_channel_business_ownership(uuid, uuid) from public, anon;
grant execute on function public.check_channel_business_ownership(uuid, uuid) to authenticated, service_role;

create or replace function public.check_storage_quota(_workspace_id uuid, _resource_type text default 'messages')
returns boolean
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  _quota record;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.has_workspace_role(_workspace_id, array['owner','admin','member','viewer']) then
    raise exception 'STORAGE_QUOTA_WORKSPACE_FORBIDDEN' using errcode = '42501';
  end if;

  select * into _quota
  from public.workspace_storage_quotas
  where workspace_id = _workspace_id;

  if _quota is null then return true; end if;

  case _resource_type
    when 'messages' then return _quota.messages_count < _quota.max_messages;
    when 'documents' then return _quota.documents_count < _quota.max_documents;
    when 'media' then return _quota.media_size_mb < _quota.max_media_mb;
    else return true;
  end case;
end;
$$;

revoke execute on function public.check_storage_quota(uuid, text) from public, anon;
grant execute on function public.check_storage_quota(uuid, text) to authenticated, service_role;

create or replace function public.community_workspace_authorized(_user_id uuid, _workspace_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select _workspace_id is not null
    and _user_id is not null
    and (
      coalesce(auth.role(), '') = 'service_role'
      or coalesce(_user_id = auth.uid(), false)
    )
    and (
      exists (
        select 1 from public.workspaces w
        where w.id = _workspace_id and w.owner_id = _user_id
      )
      or public.is_workspace_member(_user_id, _workspace_id)
    );
$$;

revoke execute on function public.community_workspace_authorized(uuid, uuid) from public, anon;
grant execute on function public.community_workspace_authorized(uuid, uuid) to authenticated, service_role;

create or replace function public.get_active_referral_count(_referrer_user_id uuid)
returns integer
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  _count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and _referrer_user_id is distinct from auth.uid() then
    raise exception 'REFERRAL_COUNT_SUBJECT_FORBIDDEN' using errcode = '42501';
  end if;

  select count(*)::int into _count
  from public.business_referrals
  where referrer_user_id = _referrer_user_id and status = 'active';

  return _count;
end;
$$;

revoke execute on function public.get_active_referral_count(uuid) from public, anon;
grant execute on function public.get_active_referral_count(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Backend-only helpers: all current product callsites use a validated Edge
--    boundary and a service-role client. Direct authenticated RPC access is not
--    needed and permitted cross-tenant probing.
-- ---------------------------------------------------------------------------

create or replace function public.check_asset_duplicate(_asset_type text, _asset_identifier text)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  _duplicate boolean := false;
begin
  if _asset_type is null or length(trim(_asset_type)) not between 1 and 80 then
    raise exception 'Invalid asset type' using errcode = '22023';
  end if;
  if _asset_identifier is null or length(trim(_asset_identifier)) not between 1 and 500 then
    raise exception 'Invalid asset identifier' using errcode = '22023';
  end if;

  select exists(
    select 1
    from public.registered_assets ra
    where ra.asset_type = trim(_asset_type)
      and lower(ra.asset_identifier) = lower(trim(_asset_identifier))
      and ra.is_active = true
  ) into _duplicate;

  if _duplicate then
    return jsonb_build_object(
      'is_duplicate', true,
      'message', 'This value is already registered. Contact support if you believe this is incorrect.'
    );
  end if;

  return jsonb_build_object('is_duplicate', false);
end;
$$;

revoke execute on function public.check_asset_duplicate(text, text) from public, anon, authenticated;
grant execute on function public.check_asset_duplicate(text, text) to service_role;

revoke execute on function public.check_freelancer_relation_eligibility(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.check_freelancer_relation_eligibility(uuid, uuid, text) to service_role;

revoke execute on function public.evaluate_contact_policy(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.evaluate_contact_policy(uuid, uuid, text, text) to service_role;

revoke execute on function public.validate_nba_against_rules(uuid, text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.validate_nba_against_rules(uuid, text, numeric, text, uuid) to service_role;

-- Trigger-only helper. Keep service-role compatibility but remove browser execution.
revoke execute on function public.enforce_p0_5_a_parent_workspace() from public, anon, authenticated;
grant execute on function public.enforce_p0_5_a_parent_workspace() to service_role;

-- Explicitly preserve the authenticated RLS/admin helpers already proven caller-bound.
-- No blanket revoke is performed on has_role, has_workspace_access,
-- has_workspace_role, is_workspace_member, is_workspace_owner,
-- community_is_staff, is_platform_operator, or assign_thread_round_robin.

commit;
