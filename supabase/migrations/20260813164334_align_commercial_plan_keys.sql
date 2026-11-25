-- Align commercial plan keys with application PlanKey: standard, professional, advanced, enterprise.
-- Preserve semantic tiers: legacy growth -> professional; legacy professional -> advanced.

-- pricing_settings has a unique plan_key, so use a temporary key to avoid collision.
UPDATE public.pricing_settings SET plan_key = '__legacy_professional__' WHERE plan_key = 'professional';
UPDATE public.pricing_settings SET plan_key = 'professional', plan_name = 'Professional', plan_label = 'Professional' WHERE plan_key = 'growth';
UPDATE public.pricing_settings SET plan_key = 'advanced', plan_name = 'Advanced', plan_label = 'Advanced' WHERE plan_key = '__legacy_professional__';
UPDATE public.pricing_settings SET plan_name = 'Standard', plan_label = 'Standard' WHERE plan_key = 'standard';
UPDATE public.pricing_settings SET plan_name = 'Enterprise', plan_label = 'Enterprise' WHERE plan_key = 'enterprise';

-- Keep any existing transactional references semantically aligned.
UPDATE public.gift_subscription_requests SET plan_key = '__legacy_professional__' WHERE plan_key = 'professional';
UPDATE public.gift_subscription_requests SET plan_key = 'professional' WHERE plan_key = 'growth';
UPDATE public.gift_subscription_requests SET plan_key = 'advanced' WHERE plan_key = '__legacy_professional__';

UPDATE public.manual_payments SET plan_key = '__legacy_professional__' WHERE plan_key = 'professional';
UPDATE public.manual_payments SET plan_key = 'professional' WHERE plan_key = 'growth';
UPDATE public.manual_payments SET plan_key = 'advanced' WHERE plan_key = '__legacy_professional__';

UPDATE public.paypal_transactions SET plan_key = '__legacy_professional__' WHERE plan_key = 'professional';
UPDATE public.paypal_transactions SET plan_key = 'professional' WHERE plan_key = 'growth';
UPDATE public.paypal_transactions SET plan_key = 'advanced' WHERE plan_key = '__legacy_professional__';

UPDATE public.business_referrals SET subscription_plan = '__legacy_professional__' WHERE subscription_plan = 'professional';
UPDATE public.business_referrals SET subscription_plan = 'professional' WHERE subscription_plan = 'growth';
UPDATE public.business_referrals SET subscription_plan = 'advanced' WHERE subscription_plan = '__legacy_professional__';

UPDATE public.subscriptions SET plan = '__legacy_professional__' WHERE plan = 'professional';
UPDATE public.subscriptions SET plan = 'professional' WHERE plan = 'growth';
UPDATE public.subscriptions SET plan = 'advanced' WHERE plan = '__legacy_professional__';;
