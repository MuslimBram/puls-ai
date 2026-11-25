-- Platform role model
-- super_admin is presented as Owner
-- admin is presented as Pulse AI Admin
-- business_owner is presented as Business Admin

-- Admin business provisioning: highest plan, lifetime, no expiry.
alter table public.gift_subscription_requests
  add column if not exists is_lifetime boolean not null default false;

alter table public.gift_subscription_requests
  alter column approvals_required set default 1;

update public.gift_subscription_requests
set approvals_required = 1
where status in ('pending_ai_check', 'pending_approval', 'approved')
  and approvals_required = 7;

drop policy if exists owner_create_gifts on public.gift_subscription_requests;
drop policy if exists admin_create_lifetime_gifts on public.gift_subscription_requests;

create policy owner_create_gifts
on public.gift_subscription_requests
for insert to authenticated
with check (
  initiated_by = auth.uid()
  and amount_paid = 0
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  )
);

create policy admin_create_lifetime_gifts
on public.gift_subscription_requests
for insert to authenticated
with check (
  initiated_by = auth.uid()
  and amount_paid = 0
  and plan_key = 'enterprise'
  and is_lifetime = true
  and custom_expiry_date is null
  and duration_months = 0
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  )
);

create or replace function public.enforce_gift_approval_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift gift_subscription_requests%rowtype;
  v_count integer;
  v_is_reg boolean;
  v_approver_is_admin boolean;
begin
  select * into v_gift from gift_subscription_requests where id = new.gift_id;
  if not found then raise exception 'Gift not found'; end if;
  if v_gift.status <> 'pending_approval' then
    raise exception 'Gift not in pending_approval status (current: %)', v_gift.status;
  end if;

  select exists(
    select 1 from gift_approval_registry
    where admin_user_id = new.admin_user_id and is_active = true
  ) into v_is_reg;
  if not v_is_reg then raise exception 'Not a designated approver'; end if;

  select exists(
    select 1 from user_roles
    where user_id = new.admin_user_id and role = 'admin'
  ) into v_approver_is_admin;
  if not v_approver_is_admin then raise exception 'Approver must be a Pulse AI Admin'; end if;

  if v_gift.initiated_by = new.admin_user_id then
    raise exception 'Initiator cannot self-approve';
  end if;

  select count(*) + 1 into v_count
  from gift_subscription_approvals
  where gift_id = new.gift_id;

  update gift_subscription_requests
  set approvals_received = v_count,
      status = case
        when v_count >= greatest(v_gift.approvals_required, 1)
         and ai_approved is true then 'approved'
        else 'pending_approval'
      end,
      updated_at = now()
  where id = new.gift_id;

  insert into gift_subscription_audit(gift_id, event_type, event_data, actor_id)
  values (
    new.gift_id,
    'admin_approved',
    jsonb_build_object(
      'approval_num', v_count,
      'required', greatest(v_gift.approvals_required, 1),
      'admin', new.admin_user_id,
      'ai_approved', v_gift.ai_approved
    ),
    new.admin_user_id
  );

  return new;
end;
$$;

create or replace function public.activate_gift_subscription(
  p_gift_id uuid,
  p_activator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gift gift_subscription_requests%rowtype;
  v_cnt integer;
  v_is_admin boolean;
  v_end date;
  v_acct_id uuid;
  v_second_admin boolean;
begin
  if auth.uid() is null or auth.uid() <> p_activator_id then
    raise exception 'Authenticated activator required';
  end if;

  select exists(
    select 1 from user_roles
    where user_id = p_activator_id and role in ('admin','super_admin')
  ) into v_is_admin;
  if not v_is_admin then raise exception 'Admin required'; end if;

  select * into v_gift from gift_subscription_requests where id = p_gift_id for update;
  if not found then raise exception 'Gift not found'; end if;

  if v_gift.ai_approved is not true or v_gift.ai_check_at is null then
    raise exception 'AI risk approval required';
  end if;

  select count(distinct admin_user_id) into v_cnt
  from gift_subscription_approvals
  where gift_id = p_gift_id;

  if v_cnt < greatest(v_gift.approvals_required, 1) then
    raise exception 'At least % independent admin approval(s) required; found %',
      greatest(v_gift.approvals_required, 1), v_cnt;
  end if;

  select exists(
    select 1 from gift_subscription_approvals
    where gift_id = p_gift_id and admin_user_id <> v_gift.initiated_by
  ) into v_second_admin;
  if not v_second_admin then
    raise exception 'A second Pulse AI Admin must approve; the initiator cannot self-approve';
  end if;

  if v_gift.status <> 'approved' then
    raise exception 'Must be approved (current: %)', v_gift.status;
  end if;

  v_end := case
    when v_gift.is_lifetime then null
    else coalesce(
      v_gift.custom_expiry_date,
      (current_date + (v_gift.duration_months * interval '1 month'))::date
    )
  end;

  if v_gift.recipient_user_id is not null then
    insert into subscriptions(
      user_id, plan, subscription_status, payment_status, payment_method,
      billing_cycle_start, package_start_at, package_end_at,
      package_type, package_duration_months, updated_at
    )
    values(
      v_gift.recipient_user_id,
      v_gift.plan_key,
      'active', 'gift', 'gift', now(), now(), v_end::timestamptz,
      case when v_gift.is_lifetime then 'gift_lifetime' else 'gift' end,
      case when v_gift.is_lifetime then null else v_gift.duration_months end,
      now()
    )
    on conflict(user_id) do update set
      plan = excluded.plan,
      subscription_status = 'active',
      payment_status = 'gift',
      payment_method = 'gift',
      billing_cycle_start = now(),
      package_start_at = now(),
      package_end_at = excluded.package_end_at,
      package_type = excluded.package_type,
      package_duration_months = excluded.package_duration_months,
      updated_at = now();
  end if;

  insert into accounting_transactions(
    external_ref, accounting_category, gross_amount, currency,
    payment_provider, provider_fees, payer_user_id, payer_label,
    beneficiary_user_id, source_table, source_id, accountant_review_status
  )
  values(
    v_gift.gift_ref,
    'promotional_subscription_gift',
    0,
    coalesce(v_gift.commercial_currency, 'EUR'),
    'none',
    0,
    v_gift.initiated_by,
    'Pulse AI Gift',
    v_gift.recipient_user_id,
    'gift_subscription_requests',
    p_gift_id,
    'pending'
  )
  returning id into v_acct_id;

  update gift_subscription_requests
  set status = 'activated',
      activated_at = now(),
      start_date = current_date,
      end_date = v_end,
      accounting_tx_id = v_acct_id,
      updated_at = now()
  where id = p_gift_id;

  insert into gift_subscription_audit(gift_id, event_type, event_data, actor_id)
  values(
    p_gift_id,
    'activated',
    jsonb_build_object(
      'end_date', v_end,
      'lifetime', v_gift.is_lifetime,
      'approvals', v_cnt,
      'ai_approved', true,
      'activator', p_activator_id
    ),
    p_activator_id
  );

  return jsonb_build_object(
    'ok', true,
    'lifetime', v_gift.is_lifetime,
    'end_date', v_end,
    'approvals_verified', v_cnt,
    'ai_verified', true
  );
end;
$$;

-- Register all current Pulse AI Admins as designated secondary approvers.
insert into public.gift_approval_registry(admin_user_id, role_label, is_active)
select ur.user_id, 'Pulse AI Admin', true
from public.user_roles ur
where ur.role = 'admin'
on conflict (admin_user_id) do update
set is_active = true, role_label = 'Pulse AI Admin';

comment on table public.gift_subscription_approvals is
  'Unique per Pulse AI Admin per gift. Initiator cannot approve. One independent admin approval is required after AI approval.';

comment on table public.gift_subscription_requests is
  'amount_paid always 0. AI approval is required, and at least one different Pulse AI Admin approval is required. Admin lifetime gifts are enterprise with no expiry.';
