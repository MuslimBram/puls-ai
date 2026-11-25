-- ============================================================================
-- HAPI 5 / STEP 1 (1,2) — payment_status can no longer be left behind.
--
-- Problem: no code path anywhere writes subscriptions.payment_status.
-- capture-paypal-order fulfils by upserting plan + subscription_status='active'
-- and never touches payment_status, so a paying customer stays 'trial' forever,
-- which is also the predicate the account-deleter uses.
--
-- Fix at the DATA layer, not in one edge function, so that no future code path
-- can miss it. payment_status is DERIVED from hard payment evidence:
--
--   stripe : subscriptions.stripe_subscription_id is present
--   paypal : a paypal_transactions row for this user with
--            status='completed' AND paypal_capture_id IS NOT NULL
--            (exactly the test capture-paypal-order itself uses at line 158
--             to recognise an already-captured order)
--
-- Safety rules, in order of precedence:
--   * NEVER set 'paid' without evidence. No fabrication, ever.
--   * An explicit 'refunded'/'cancelled' written by an operator is never
--     overwritten by this trigger.
--   * 'paid' is only downgraded to 'expired', and only when the paid window has
--     actually ended and there is no live Stripe subscription.
-- Backward-safe: additive only. No column dropped, no row deleted, existing
-- values preserved unless evidence says otherwise.
-- ============================================================================

create or replace function public.subscription_payment_evidence(_user_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when exists (
      select 1 from public.subscriptions s
      where s.user_id = _user_id and coalesce(s.stripe_subscription_id,'') <> ''
    ) then 'stripe'
    when exists (
      select 1 from public.paypal_transactions t
      where t.user_id = _user_id
        and t.status = 'completed'
        and coalesce(t.paypal_capture_id,'') <> ''
    ) then 'paypal'
    else 'none'
  end;
$$;

revoke all on function public.subscription_payment_evidence(uuid) from public, anon;
grant execute on function public.subscription_payment_evidence(uuid) to authenticated, service_role;

create or replace function public.derive_subscription_payment_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _evidence text;
  _paid_plan boolean;
  _window_open boolean;
begin
  -- An operator-recorded terminal state is authoritative; never overwrite it.
  if NEW.payment_status in ('refunded','cancelled','chargeback') then
    return NEW;
  end if;

  _evidence := public.subscription_payment_evidence(NEW.user_id);

  -- Stripe evidence is carried on the row itself, so it is visible even on the
  -- very INSERT that introduces it (the helper reads the committed table).
  if coalesce(NEW.stripe_subscription_id,'') <> '' then
    _evidence := 'stripe';
  end if;

  _paid_plan   := coalesce(NEW.plan,'free') not in ('free','standard_trial');
  _window_open := NEW.package_end_at is null or NEW.package_end_at > now();

  if _evidence <> 'none' and _paid_plan
     and coalesce(NEW.subscription_status,'') in ('active','trialing','past_due')
     and _window_open then
    NEW.payment_status := 'paid';

  elsif NEW.payment_status = 'paid'
        and _evidence <> 'stripe'
        and NEW.package_end_at is not null
        and NEW.package_end_at <= now() then
    -- The paid window closed and there is no live Stripe subscription behind it.
    NEW.payment_status := 'expired';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_derive_subscription_payment_status on public.subscriptions;
create trigger trg_derive_subscription_payment_status
  before insert or update on public.subscriptions
  for each row execute function public.derive_subscription_payment_status();

-- capture-paypal-order fulfils the subscription BEFORE it marks the transaction
-- 'completed', so at subscription-write time the PayPal evidence does not exist
-- yet. This second trigger closes that ordering gap: the moment a capture is
-- recorded, the owning subscription is re-derived.
create or replace function public.sync_payment_status_from_paypal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.status = 'completed' and coalesce(NEW.paypal_capture_id,'') <> '' then
    update public.subscriptions
       set updated_at = now()          -- the BEFORE trigger re-derives the status
     where user_id = NEW.user_id
       and payment_status not in ('refunded','cancelled','chargeback');
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_payment_status_from_paypal on public.paypal_transactions;
create trigger trg_sync_payment_status_from_paypal
  after insert or update of status, paypal_capture_id on public.paypal_transactions
  for each row execute function public.sync_payment_status_from_paypal();;
