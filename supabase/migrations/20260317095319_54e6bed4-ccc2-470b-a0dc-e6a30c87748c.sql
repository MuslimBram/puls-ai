
-- Add referral discount tracking columns to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS referral_discount_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_discount_months_remaining integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.partner_accounts(id),
  ADD COLUMN IF NOT EXISTS total_discount_savings numeric DEFAULT 0;

-- Index for partner lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_referred_partner ON public.subscriptions(referred_by_partner_id) WHERE referred_by_partner_id IS NOT NULL;
