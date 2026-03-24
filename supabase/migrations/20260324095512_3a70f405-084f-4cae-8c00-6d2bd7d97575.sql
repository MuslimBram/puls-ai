
-- Add AI fraud detection columns to payout_requests
ALTER TABLE public.payout_requests
ADD COLUMN IF NOT EXISTS ai_fraud_score numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_fraud_reasons jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS ai_reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_iban text,
ADD COLUMN IF NOT EXISTS beneficiary_name text;
