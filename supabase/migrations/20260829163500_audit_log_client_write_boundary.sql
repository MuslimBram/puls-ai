begin;

lock table public.audit_logs in share row exclusive mode;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Cannot harden audit_logs: table is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='audit_logs'
      and policyname='authenticated_insert_own_audit_logs' and cmd='INSERT'
  ) then
    raise exception 'Cannot harden audit_logs: expected client INSERT policy is missing';
  end if;
end
$$;

create or replace function public.record_client_audit_event(
  _action text,
  _target_type text default null,
  _target_id text default null,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_workspace uuid;
  v_meta jsonb := coalesce(_metadata, '{}'::jsonb);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if _action is null or length(_action) < 3 or length(_action) > 120 then
    raise exception 'Invalid audit action';
  end if;
  if _target_type is not null and length(_target_type) > 80 then
    raise exception 'Invalid audit target type';
  end if;
  if _target_id is not null and length(_target_id) > 200 then
    raise exception 'Invalid audit target id';
  end if;
  if octet_length(v_meta::text) > 8192 then
    raise exception 'Audit metadata too large';
  end if;

  if _action = any(array[
    'conversion.plan_page_view',
    'conversion.upgrade_click',
    'conversion.paywall_trigger',
    'conversion.trial_started',
    'conversion.trial_to_paid',
    'conversion.downgrade_click',
    'conversion.downgrade_reason',
    'conversion.referral_click',
    'conversion.referral_conversion',
    'conversion.feature_adoption',
    'conversion.workspace_expansion',
    'conversion.activation_milestone',
    'conversion.churn_recovery',
    'conversion.insight_view',
    'conversion.suggestion_accepted'
  ]) then
    if _target_type is distinct from 'conversion' or _target_id is not null then
      raise exception 'Invalid conversion audit target';
    end if;

  elsif _action in ('payment_mode_change','payment_accounts_update') then
    if _target_type is distinct from 'workspace' or _target_id is null then
      raise exception 'Workspace audit target required';
    end if;
    begin
      v_workspace := _target_id::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid workspace audit target';
    end;
    if not public.has_workspace_role(v_workspace, array['owner']) then
      raise exception 'Workspace owner access required';
    end if;

  elsif _action in (
    'partner_approved','partner_rejected','payment_account_flagged',
    'business_approved','business_rejected','business_needs_changes'
  ) then
    if not public.is_platform_operator() then
      raise exception 'Platform admin access required';
    end if;
    if (_action like 'partner_%' and _target_type is distinct from 'partner')
       or (_action = 'payment_account_flagged' and _target_type is distinct from 'workspace')
       or (_action like 'business_%' and _target_type is distinct from 'business_registration') then
      raise exception 'Invalid platform audit target';
    end if;
    if _target_id is null then
      raise exception 'Audit target id required';
    end if;

  else
    raise exception 'Client audit action is not allowed';
  end if;

  v_meta := v_meta || jsonb_build_object('_source','client_rpc');

  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
  values (v_actor,_action,_target_type,_target_id,v_meta)
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function public.record_client_audit_event(text,text,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_client_audit_event(text,text,text,jsonb)
  to authenticated;

drop policy if exists "authenticated_insert_own_audit_logs" on public.audit_logs;
drop policy if exists "Admins can view all audit logs" on public.audit_logs;
create policy "p1_audit_logs_select_platform"
on public.audit_logs for select to authenticated
using (public.is_platform_operator());

revoke all privileges on table public.audit_logs
  from public, anon, authenticated, sandbox_exec, service_role;
grant select on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.audit_logs to service_role;

commit;
