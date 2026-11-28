-- ============================================================================
-- OFFICIAL PARTNER & REFERRAL POLICY — owner approved (owner-v1-2026-11-28)
--
--   Referral Program : 15% of the referred business's first successful payment
--   Referred business: 15% discount on its first payment
--   Freelancer       : 15% on the first payment + 20% of management fees
--                      actually collected from businesses they manage
--   Ambassador       : 15% on every payment (lifetime) + 15% one-time bonus on
--                      the first payment (first payment = 30% total)
--
-- The percentages are enforced in code (supabase/functions/_shared/
-- commission-policy.ts). The rows seeded below are the auditable copy that
-- admins can inspect; a test asserts both stay identical.
--
-- SAFETY
--   * PREPARED ONLY. Do not apply to Production without separate authorization.
--   * No existing commission, wallet, payout or billing row is deleted or
--     recalculated. Existing commissions are labelled 'legacy_first_payment'
--     / policy_version 'legacy' and keep their amounts and statuses.
--   * The new engine only processes payments created on/after effective_from.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Auditable policy rules (read-only for everyone signed in, writable by no
--    client: rates change only through a reviewed migration + code change).
-- ---------------------------------------------------------------------------
create table if not exists public.commission_policy_rules (
  id uuid primary key default gen_random_uuid(),
  policy_version text not null,
  program text not null check (program in ('referral','freelancer','ambassador')),
  rule_type text not null check (rule_type in (
    'referral_commission','management_fee_commission',
    'ambassador_lifetime_commission','ambassador_first_payment_bonus',
    'referred_business_discount')),
  percent numeric(5,2) not null check (percent > 0 and percent <= 100),
  applies_to text not null check (applies_to in ('first_payment','every_payment','collected_management_fee')),
  effective_from timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (policy_version, program, rule_type)
);

alter table public.commission_policy_rules enable row level security;

drop policy if exists "commission_policy_rules_read" on public.commission_policy_rules;
create policy "commission_policy_rules_read" on public.commission_policy_rules
  for select to authenticated using (true);

insert into public.commission_policy_rules (policy_version, program, rule_type, percent, applies_to, effective_from) values
  ('owner-v1-2026-11-28','referral',  'referral_commission',            15, 'first_payment',            '2026-11-28T00:00:00Z'),
  ('owner-v1-2026-11-28','referral',  'referred_business_discount',     15, 'first_payment',            '2026-11-28T00:00:00Z'),
  ('owner-v1-2026-11-28','freelancer','referral_commission',            15, 'first_payment',            '2026-11-28T00:00:00Z'),
  ('owner-v1-2026-11-28','freelancer','management_fee_commission',      20, 'collected_management_fee', '2026-11-28T00:00:00Z'),
  ('owner-v1-2026-11-28','ambassador','ambassador_lifetime_commission', 15, 'every_payment',            '2026-11-28T00:00:00Z'),
  ('owner-v1-2026-11-28','ambassador','ambassador_first_payment_bonus', 15, 'first_payment',            '2026-11-28T00:00:00Z')
on conflict (policy_version, program, rule_type) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Explicit partner program instead of one universal commission_rate.
--    Why commission_rate could be 0%: the column was created with DEFAULT 0
--    and nothing in partner registration ever wrote a value, so every partner
--    created through the normal flow had 0%. The engine no longer reads it.
-- ---------------------------------------------------------------------------
alter table public.partner_accounts
  add column if not exists partner_program text;

update public.partner_accounts pa
set partner_program = case
  when exists (select 1 from public.user_roles ur where ur.user_id = pa.user_id and ur.role::text = 'ambassador') then 'ambassador'
  else 'freelancer'
end
where pa.partner_program is null;

alter table public.partner_accounts
  alter column partner_program set default 'freelancer',
  alter column partner_program set not null;

alter table public.partner_accounts
  drop constraint if exists partner_accounts_partner_program_check;
alter table public.partner_accounts
  add constraint partner_accounts_partner_program_check
  check (partner_program in ('freelancer','ambassador'));

comment on column public.partner_accounts.commission_rate is
  'LEGACY (pre owner-v1). Not read by the commission engine. Rates come from commission_policy_rules / commission-policy.ts.';

-- Referred-business discount for partner referrals: 15% on the first payment.
-- This changes configuration for FUTURE checkouts only.
alter table public.partner_accounts
  alter column referral_discount_percent set default 15,
  alter column discount_duration_months set default 1;
update public.partner_accounts
set referral_discount_percent = 15, discount_duration_months = 1
where referral_discount_percent = 0;

alter table public.freelancer_business_relations
  alter column commission_rate set default 20;
comment on column public.freelancer_business_relations.commission_rate is
  'LEGACY display value. Management-fee share is 20% per commission_policy_rules.';

-- Ordinary business referral codes: referrer earns 15%, referred business gets 15% off.
alter table public.business_referral_codes
  alter column reward_value set default 15;
update public.business_referral_codes set reward_value = 15 where reward_value is distinct from 15;

-- ---------------------------------------------------------------------------
-- 3. Typed, idempotent partner commission ledger.
-- ---------------------------------------------------------------------------
alter table public.partner_commissions
  add column if not exists commission_type text not null default 'legacy_first_payment',
  add column if not exists policy_version text not null default 'legacy',
  add column if not exists source_payment_kind text,
  add column if not exists source_payment_id text,
  add column if not exists currency text,
  add column if not exists reversal_of uuid references public.partner_commissions(id),
  add column if not exists reversal_reason text,
  add column if not exists reversed_at timestamptz,
  add column if not exists management_fee_id uuid;

alter table public.partner_commissions drop constraint if exists partner_commissions_commission_type_check;
alter table public.partner_commissions add constraint partner_commissions_commission_type_check
  check (commission_type in ('legacy_first_payment','referral_commission','management_fee_commission',
                             'ambassador_lifetime_commission','ambassador_first_payment_bonus'));

alter table public.partner_commissions drop constraint if exists partner_commissions_source_kind_check;
alter table public.partner_commissions add constraint partner_commissions_source_kind_check
  check (source_payment_kind is null or source_payment_kind in ('subscription_payment','management_fee'));

-- New-policy rows must carry their source payment (idempotency key).
alter table public.partner_commissions drop constraint if exists partner_commissions_source_required_check;
alter table public.partner_commissions add constraint partner_commissions_source_required_check
  check (commission_type = 'legacy_first_payment' or (source_payment_kind is not null and source_payment_id is not null));

-- The old index allowed ONE first-payment row per partner+workspace, which
-- would block the ambassador's lifetime row + bonus on the same payment.
-- Keep exactly the same guarantee for legacy rows, and add typed keys.
drop index if exists public.partner_commissions_first_payment_unique;
create unique index if not exists partner_commissions_legacy_first_payment_unique
  on public.partner_commissions (partner_id, workspace_id)
  where is_first_payment = true and commission_type = 'legacy_first_payment';

-- One commission of each type per source payment (duplicate webhook guard).
create unique index if not exists partner_commissions_source_unique
  on public.partner_commissions (partner_id, commission_type, source_payment_kind, source_payment_id)
  where source_payment_id is not null and reversal_of is null;

-- First-payment-only types can exist once per referred workspace, ever.
create unique index if not exists partner_commissions_once_per_workspace_unique
  on public.partner_commissions (partner_id, workspace_id, commission_type)
  where commission_type in ('referral_commission','ambassador_first_payment_bonus') and reversal_of is null;

-- A commission can be clawed back at most once.
create unique index if not exists partner_commissions_one_reversal_unique
  on public.partner_commissions (reversal_of) where reversal_of is not null;

create index if not exists partner_commissions_source_lookup_idx
  on public.partner_commissions (source_payment_kind, source_payment_id);

-- One payment row per Stripe invoice, so a re-delivered invoice can never
-- produce a second payment (and therefore a second recurring commission).
-- Created only when existing data has no duplicates; otherwise flagged.
do $$
begin
  if exists (
    select stripe_invoice_id from public.billing_history
    where stripe_invoice_id is not null
    group by stripe_invoice_id having count(*) > 1
  ) then
    raise warning 'billing_history has duplicate stripe_invoice_id rows; unique index NOT created — dedupe first';
  else
    create unique index if not exists billing_history_stripe_invoice_unique
      on public.billing_history (stripe_invoice_id) where stripe_invoice_id is not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Management fees actually collected from managed businesses.
-- ---------------------------------------------------------------------------
create table if not exists public.partner_management_fees (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_accounts(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'ALL',
  status text not null default 'invoiced' check (status in ('invoiced','collected','refunded','cancelled')),
  refund_amount numeric(12,2) not null default 0 check (refund_amount >= 0),
  collected_at timestamptz,
  source_reference text unique,
  recorded_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'collected' or collected_at is not null)
);

alter table public.partner_management_fees enable row level security;

drop policy if exists "partner_management_fees_partner_read" on public.partner_management_fees;
create policy "partner_management_fees_partner_read" on public.partner_management_fees
  for select to authenticated
  using (partner_id in (select id from public.partner_accounts where user_id = auth.uid()));

drop policy if exists "partner_management_fees_admin_all" on public.partner_management_fees;
create policy "partner_management_fees_admin_all" on public.partner_management_fees
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

-- ---------------------------------------------------------------------------
-- 5. Ordinary Referral Program rewards (separate from partner commissions).
-- ---------------------------------------------------------------------------
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  -- No FK to auth.users: the reward is financial history and must survive
  -- (and must not block) the unpaid-trial account cleanup.
  referrer_user_id uuid not null,
  referred_user_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  referral_code text not null,
  commission_type text not null default 'referral_commission' check (commission_type = 'referral_commission'),
  source_payment_kind text not null default 'subscription_payment' check (source_payment_kind = 'subscription_payment'),
  source_payment_id text not null,
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  reward_percent numeric(5,2) not null check (reward_percent > 0),
  reward_amount numeric(12,2) not null,
  currency text not null default 'ALL',
  reward_status text not null default 'pending_refund_window'
    check (reward_status in ('pending_refund_window','approved','cancelled','reversed')),
  policy_version text not null,
  reversal_of uuid references public.referral_rewards(id),
  reversal_reason text,
  reversed_at timestamptz,
  approved_at timestamptz,
  wallet_transaction_id uuid,
  created_at timestamptz not null default now()
);

-- Once per referred workspace, once per source payment; one clawback per reward.
create unique index if not exists referral_rewards_once_per_workspace_unique
  on public.referral_rewards (workspace_id) where reversal_of is null;
create unique index if not exists referral_rewards_source_unique
  on public.referral_rewards (source_payment_kind, source_payment_id) where reversal_of is null;
create unique index if not exists referral_rewards_one_reversal_unique
  on public.referral_rewards (reversal_of) where reversal_of is not null;

alter table public.referral_rewards enable row level security;

drop policy if exists "referral_rewards_referrer_read" on public.referral_rewards;
create policy "referral_rewards_referrer_read" on public.referral_rewards
  for select to authenticated using (referrer_user_id = auth.uid());

drop policy if exists "referral_rewards_admin_read" on public.referral_rewards;
create policy "referral_rewards_admin_read" on public.referral_rewards
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

-- Referral attribution is now written by the server from the referred user's
-- own signup code. A referrer must not be able to fabricate a referral row
-- naming someone else's account.
drop policy if exists "Users can insert own referrals" on public.business_referrals;

-- ---------------------------------------------------------------------------
-- 6. Atomic money movements (service_role only).
-- ---------------------------------------------------------------------------

-- Recompute a partner wallet's pending amount from the ledger (idempotent).
create or replace function public.refresh_partner_pending(_partner_id uuid)
returns numeric
language sql security definer set search_path = public
as $$
  with s as (
    select coalesce(sum(commission_amount), 0) as total
    from public.partner_commissions
    where partner_id = _partner_id
      and commission_status in ('pending','pending_refund_window')
      and reversal_of is null
  )
  update public.partner_wallets w
  set pending_amount = s.total, updated_at = now()
  from s
  where w.partner_id = _partner_id
  returning w.pending_amount;
$$;

-- Cancel (unpaid) or claw back (approved/paid) one partner commission.
create or replace function public.reverse_partner_commission(_commission_id uuid, _amount numeric, _reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  c public.partner_commissions%rowtype;
  v_clawback_id uuid;
begin
  if _reason not in ('refund','chargeback','fraud','admin') then
    raise exception 'invalid reversal reason %', _reason;
  end if;

  select * into c from public.partner_commissions where id = _commission_id for update;
  if not found then return 'not_found'; end if;
  if c.reversal_of is not null then return 'is_reversal_row'; end if;
  if c.commission_status in ('cancelled','reversed') then return 'already_reversed'; end if;

  if c.commission_status in ('approved','paid') then
    insert into public.partner_commissions (
      partner_id, workspace_id, subscription_id, plan_name, gross_amount, commission_percent,
      commission_amount, commission_status, is_first_payment, source_invoice_id,
      commission_type, policy_version, source_payment_kind, source_payment_id, currency,
      reversal_of, reversal_reason, reversed_at)
    values (
      c.partner_id, c.workspace_id, c.subscription_id, c.plan_name, c.gross_amount, c.commission_percent,
      -abs(least(_amount, c.commission_amount)), 'approved', false, c.source_invoice_id,
      c.commission_type, c.policy_version, c.source_payment_kind, c.source_payment_id, c.currency,
      c.id, _reason, now())
    returning id into v_clawback_id;

    update public.partner_commissions
    set commission_status = 'reversed', reversal_reason = _reason, reversed_at = now()
    where id = c.id;

    update public.partner_wallets
    set current_balance = current_balance - abs(least(_amount, c.commission_amount)),
        lifetime_earnings = lifetime_earnings - abs(least(_amount, c.commission_amount)),
        updated_at = now()
    where partner_id = c.partner_id;

    insert into public.partner_wallet_transactions (partner_id, type, amount, reference_id, description)
    values (c.partner_id, 'commission_reversal', -abs(least(_amount, c.commission_amount)), v_clawback_id,
            'Commission reversed: ' || _reason);
  else
    update public.partner_commissions
    set commission_status = 'cancelled', reversal_reason = _reason, reversed_at = now()
    where id = c.id;
  end if;

  perform public.refresh_partner_pending(c.partner_id);
  return 'reversed';
end;
$$;

-- Credit an ordinary referral reward to the referrer's wallet, exactly once.
create or replace function public.credit_referral_reward(_reward_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  r public.referral_rewards%rowtype;
  v_wallet_id uuid;
  v_tx_id uuid;
begin
  select * into r from public.referral_rewards where id = _reward_id for update;
  if not found then return 'not_found'; end if;
  if r.reward_status <> 'pending_refund_window' or r.reversal_of is not null then return 'not_pending'; end if;

  insert into public.user_wallets (user_id, currency)
  values (r.referrer_user_id, r.currency)
  on conflict (user_id, currency) do nothing;
  select id into v_wallet_id from public.user_wallets where user_id = r.referrer_user_id and currency = r.currency;

  insert into public.user_wallet_transactions (wallet_id, user_id, type, amount, currency, status, description, reference_id, metadata)
  values (v_wallet_id, r.referrer_user_id, 'referral_reward', r.reward_amount, r.currency, 'completed',
          'Referral reward (15% of first payment)', r.id::text,
          jsonb_build_object('policy_version', r.policy_version, 'source_payment_id', r.source_payment_id))
  returning id into v_tx_id;

  update public.user_wallets
  set current_balance = current_balance + r.reward_amount,
      lifetime_deposits = lifetime_deposits + r.reward_amount,
      updated_at = now()
  where id = v_wallet_id;

  update public.referral_rewards
  set reward_status = 'approved', approved_at = now(), wallet_transaction_id = v_tx_id
  where id = r.id;

  update public.business_referrals
  set reward_status = 'approved', reward_amount = r.reward_amount
  where referrer_user_id = r.referrer_user_id and referred_user_id = r.referred_user_id;

  return 'credited';
end;
$$;

-- Cancel or claw back an ordinary referral reward.
create or replace function public.reverse_referral_reward(_reward_id uuid, _amount numeric, _reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  r public.referral_rewards%rowtype;
  v_amount numeric;
  v_wallet_id uuid;
begin
  if _reason not in ('refund','chargeback','fraud','admin') then
    raise exception 'invalid reversal reason %', _reason;
  end if;
  select * into r from public.referral_rewards where id = _reward_id for update;
  if not found then return 'not_found'; end if;
  if r.reversal_of is not null then return 'is_reversal_row'; end if;
  if r.reward_status in ('cancelled','reversed') then return 'already_reversed'; end if;

  v_amount := abs(least(_amount, r.reward_amount));
  if r.reward_status = 'approved' then
    insert into public.referral_rewards (
      referrer_user_id, referred_user_id, workspace_id, referral_code, source_payment_id,
      gross_amount, reward_percent, reward_amount, currency, reward_status, policy_version,
      reversal_of, reversal_reason, reversed_at)
    values (
      r.referrer_user_id, r.referred_user_id, r.workspace_id, r.referral_code, r.source_payment_id,
      r.gross_amount, r.reward_percent, -v_amount, r.currency, 'approved', r.policy_version,
      r.id, _reason, now());

    select id into v_wallet_id from public.user_wallets where user_id = r.referrer_user_id and currency = r.currency;
    insert into public.user_wallet_transactions (wallet_id, user_id, type, amount, currency, status, description, reference_id)
    values (v_wallet_id, r.referrer_user_id, 'referral_reward_reversal', -v_amount, r.currency, 'completed',
            'Referral reward reversed: ' || _reason, r.id::text);
    update public.user_wallets set current_balance = current_balance - v_amount, updated_at = now() where id = v_wallet_id;
    update public.referral_rewards set reward_status = 'reversed', reversal_reason = _reason, reversed_at = now() where id = r.id;
  else
    update public.referral_rewards set reward_status = 'cancelled', reversal_reason = _reason, reversed_at = now() where id = r.id;
  end if;

  update public.business_referrals
  set reward_status = 'cancelled'
  where referrer_user_id = r.referrer_user_id and referred_user_id = r.referred_user_id;
  return 'reversed';
end;
$$;

revoke all on function public.refresh_partner_pending(uuid) from public, anon, authenticated;
revoke all on function public.reverse_partner_commission(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.credit_referral_reward(uuid) from public, anon, authenticated;
revoke all on function public.reverse_referral_reward(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.refresh_partner_pending(uuid) to service_role;
grant execute on function public.reverse_partner_commission(uuid, numeric, text) to service_role;
grant execute on function public.credit_referral_reward(uuid) to service_role;
grant execute on function public.reverse_referral_reward(uuid, numeric, text) to service_role;

-- Admin approval: atomic and idempotent (previously done from the browser,
-- where a double click could credit the same commission twice).
create or replace function public.admin_approve_partner_commission(_commission_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  c public.partner_commissions%rowtype;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin')) then
    raise exception 'admin role required';
  end if;
  select * into c from public.partner_commissions where id = _commission_id for update;
  if not found then return 'not_found'; end if;
  if c.reversal_of is not null or c.commission_status <> 'pending' or c.commission_amount <= 0 then
    return 'not_pending';
  end if;
  if exists (select 1 from public.partner_accounts where id = c.partner_id and status <> 'active') then
    return 'partner_inactive';
  end if;

  update public.partner_commissions set commission_status = 'approved' where id = c.id;
  insert into public.partner_wallets (partner_id) values (c.partner_id) on conflict (partner_id) do nothing;
  update public.partner_wallets
  set current_balance = current_balance + c.commission_amount,
      lifetime_earnings = lifetime_earnings + c.commission_amount,
      updated_at = now()
  where partner_id = c.partner_id;
  insert into public.partner_wallet_transactions (partner_id, type, amount, reference_id, description)
  values (c.partner_id, 'commission_credit', c.commission_amount, c.id,
          'Commission approved: ' || c.commission_type);
  perform public.refresh_partner_pending(c.partner_id);
  return 'approved';
end;
$$;

create or replace function public.admin_cancel_partner_commission(_commission_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_amount numeric;
begin
  if not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin')) then
    raise exception 'admin role required';
  end if;
  select commission_amount into v_amount from public.partner_commissions where id = _commission_id;
  if v_amount is null then return 'not_found'; end if;
  return public.reverse_partner_commission(_commission_id, v_amount, 'admin');
end;
$$;

revoke all on function public.admin_approve_partner_commission(uuid) from public, anon;
revoke all on function public.admin_cancel_partner_commission(uuid) from public, anon;
grant execute on function public.admin_approve_partner_commission(uuid) to authenticated;
grant execute on function public.admin_cancel_partner_commission(uuid) to authenticated;

commit;
