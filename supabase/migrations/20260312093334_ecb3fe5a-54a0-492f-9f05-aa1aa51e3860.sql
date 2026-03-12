
-- Add trial and grace period columns to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS trial_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS grace_period_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ai_replies_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_replies_reset_at timestamp with time zone NOT NULL DEFAULT now();

-- Enable pg_cron and pg_net for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to reset monthly usage
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET leads_used = 0, updated_at = now()
  WHERE billing_cycle_start <= now() - interval '1 month';
  
  -- Update billing cycle start for those reset
  UPDATE public.subscriptions
  SET billing_cycle_start = now(), updated_at = now()
  WHERE billing_cycle_start <= now() - interval '1 month';
END;
$$;

-- Function to reset daily AI replies
CREATE OR REPLACE FUNCTION public.reset_daily_ai_replies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.subscriptions
  SET ai_replies_today = 0, ai_replies_reset_at = now(), updated_at = now()
  WHERE ai_replies_reset_at <= now() - interval '1 day';
END;
$$;
