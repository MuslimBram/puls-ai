-- ============================================================================
-- HAPI 5 / B1 — a paid plan can no longer be downgraded by a Stripe-only view.
--
-- check-subscription runs on a 60s poll from the browser. When Stripe has no
-- customer for the user's email it writes:
--     syncSubscriptionRow({ plan: "standard", subscription_status: ... })
-- (check-subscription/index.ts, both the `customers.data.length === 0` branch
-- and the `!sub` branch). PayPal and wallet purchases never create a Stripe
-- customer, so the frontend's own poll silently revokes a plan the customer
-- paid for.
--
-- Fixing only that one function would leave the same trap for every future
-- caller. The invariant belongs where the plan lives: while a subscription is
-- backed by non-Stripe payment evidence AND its paid window is still open, its
-- plan may be upgraded or left alone, but NOT downgraded.
--
-- "Downgrade" is judged on a plan rank, so a same-rank rewrite is a no-op and
-- an upgrade still works. Stripe-backed rows are untouched by this guard:
-- Stripe is authoritative for its own subscriptions.
-- ============================================================================

create or replace function public.plan_rank(_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(_plan,'free')
    when 'free'          then 0
    when 'standard_trial' then 0
    when 'standard'      then 1
    when 'starter'       then 2
    when 'professional'  then 3
    when 'advanced'      then 4
    when 'enterprise'    then 5
    else 1                       -- unknown plan keys rank as standard
  end;
$$;

create or replace function public.protect_paid_plan_downgrade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _evidence text;
  _window_open boolean;
begin
  if public.plan_rank(NEW.plan) >= public.plan_rank(OLD.plan) then
    return NEW;                                   -- upgrade or no change
  end if;

  -- Stripe is the authority for Stripe-backed subscriptions; let it downgrade.
  if coalesce(OLD.stripe_subscription_id,'') <> '' then
    return NEW;
  end if;

  _evidence    := public.subscription_payment_evidence(OLD.user_id);
  _window_open := OLD.package_end_at is null or OLD.package_end_at > now();

  -- An operator-recorded refund/cancellation SHOULD downgrade.
  if NEW.payment_status in ('refunded','cancelled','chargeback')
     or OLD.payment_status in ('refunded','cancelled','chargeback') then
    return NEW;
  end if;

  if _evidence = 'paypal' and _window_open then
    raise warning
      '[protect_paid_plan_downgrade] refused % -> % for user % (paypal evidence, window open until %)',
      OLD.plan, NEW.plan, OLD.user_id, OLD.package_end_at;
    NEW.plan := OLD.plan;                          -- keep the paid plan
    NEW.package_end_at := OLD.package_end_at;
  end if;

  return NEW;
end;
$$;

-- Runs AFTER the derivation trigger so payment_status is already settled.
drop trigger if exists trg_protect_paid_plan_downgrade on public.subscriptions;
create trigger trg_protect_paid_plan_downgrade
  before update of plan on public.subscriptions
  for each row execute function public.protect_paid_plan_downgrade();;
