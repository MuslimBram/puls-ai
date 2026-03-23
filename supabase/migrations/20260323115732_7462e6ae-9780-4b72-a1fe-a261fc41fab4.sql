
CREATE TABLE IF NOT EXISTS public.login_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.login_otp_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_login_otp_user ON public.login_otp_codes (user_id, used, expires_at);
