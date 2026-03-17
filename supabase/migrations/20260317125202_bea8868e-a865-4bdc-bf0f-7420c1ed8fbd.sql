
-- Add geo_city to security_events
ALTER TABLE public.security_events ADD COLUMN IF NOT EXISTS geo_city text;

-- Create TOTP secrets table for 2FA
CREATE TABLE public.totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own TOTP" ON public.totp_secrets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
