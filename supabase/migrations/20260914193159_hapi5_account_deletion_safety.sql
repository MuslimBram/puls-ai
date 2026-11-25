-- ============================================================================
-- HAPI 5 / STEP 1 (3) — the account deleter can no longer reach a paying user.
--
-- cleanup_expired_unpaid_accounts() deletes auth.users rows (cascading to
-- profile, workspace, channels, inbox, subscription) for anyone whose
-- payment_status is trial/unpaid/expired and who is older than 30 days.
-- Its only exclusions were the roles admin/super_admin/ambassador.
--
-- This rewrite adds payment evidence as a hard exclusion, and a fail-closed
-- assertion: if a candidate somehow still carries evidence of payment, the
-- function raises instead of deleting. A bug must stop the job, not erase a
-- customer.
--
-- A preview function is added so the candidate set can be inspected in
-- production without deleting anything.
--
-- The cron job stays DISABLED. This migration does not re-enable it.
-- ============================================================================

create or replace function public.deletion_candidate_accounts()
returns table (
  user_id uuid,
  created_at timestamptz,
  payment_status text,
  plan text,
  age interval,
  payment_evidence text,
  has_paypal_attempt boolean,
  excluded_reason text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    s.user_id,
    s.created_at,
    s.payment_status,
    s.plan,
    now() - s.created_at as age,
    public.subscription_payment_evidence(s.user_id) as payment_evidence,
    exists (select 1 from public.paypal_transactions t where t.user_id = s.user_id) as has_paypal_attempt,
    case
      when exists (select 1 from public.user_roles ur
                   where ur.user_id = s.user_id
                     and ur.role in ('admin','super_admin')) then 'role_admin'
      when exists (select 1 from public.user_roles ur
                   where ur.user_id = s.user_id and ur.role = 'ambassador') then 'role_ambassador'
      when public.subscription_payment_evidence(s.user_id) <> 'none' then 'payment_evidence'
      when coalesce(s.stripe_customer_id,'') <> '' then 'stripe_customer'
      when coalesce(s.plan,'free') not in ('free','standard_trial') then 'paid_plan'
      when s.payment_status = 'paid' then 'payment_status_paid'
      when exists (select 1 from public.paypal_transactions t where t.user_id = s.user_id) then 'paypal_attempt_unresolved'
      when s.created_at >= now() - interval '30 days' then 'within_30_days'
      when s.payment_status not in ('trial','unpaid','expired') then 'status_not_eligible'
      else null                                    -- null = genuinely deletable
    end as excluded_reason
  from public.subscriptions s;
$$;

revoke all on function public.deletion_candidate_accounts() from public, anon, authenticated;
grant execute on function public.deletion_candidate_accounts() to service_role;

create or replace function public.cleanup_expired_unpaid_accounts()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  _deleted_count int := 0;
  _guard_hits    int := 0;
  _rec           record;
begin
  -- Fail closed: if anything with payment evidence is still selectable by the
  -- predicate below, stop the whole run rather than delete a customer.
  select count(*) into _guard_hits
  from public.deletion_candidate_accounts()
  where excluded_reason is null
    and (payment_evidence <> 'none' or has_paypal_attempt);

  if _guard_hits > 0 then
    raise exception
      'cleanup_expired_unpaid_accounts aborted: % candidate(s) carry payment evidence', _guard_hits;
  end if;

  for _rec in
    select user_id, created_at, payment_status
    from public.deletion_candidate_accounts()
    where excluded_reason is null
  loop
    insert into public.audit_logs (actor_id, action, target_id, target_type, metadata)
    values (
      _rec.user_id, 'auto_delete_unpaid_account', _rec.user_id::text, 'user',
      jsonb_build_object(
        'reason', 'No payment within 30 days of registration',
        'registration_date', _rec.created_at,
        'payment_status', _rec.payment_status,
        'guard_version', 'hapi5_account_deletion_safety'
      )
    );

    delete from auth.users where id = _rec.user_id;
    _deleted_count := _deleted_count + 1;
  end loop;

  return jsonb_build_object(
    'deleted_count', _deleted_count,
    'guard_version', 'hapi5_account_deletion_safety',
    'executed_at', now()
  );
end;
$$;

revoke all on function public.cleanup_expired_unpaid_accounts() from public, anon, authenticated;
grant execute on function public.cleanup_expired_unpaid_accounts() to service_role;;
