-- Table to store user security codes (custom 2FA)
-- Format: 1 capital letter + 3 letters + 1 symbol + 1 punctuation + 3 numbers
CREATE TABLE public.user_security_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_codes ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own security code
CREATE POLICY "Users manage own security code"
  ON public.user_security_codes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add 'ambassador' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ambassador';