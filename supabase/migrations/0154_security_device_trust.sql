-- supabase/migrations/0154_security_device_trust.sql
-- ============================================================
-- SIGURIA — Device Trust + AI Risk Engine + Admin Approval
-- ============================================================

-- ── 1. PAJISJET E BESUAR (per user) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Identifikimi i pajisjes
  device_fingerprint text NOT NULL, -- hash i user-agent + platform
  device_name       text,           -- "Chrome / Windows 11"
  device_type       text,           -- 'desktop','mobile','tablet'
  browser           text,
  os                text,
  -- IP-të e besura per këtë pajisje
  trusted_ips       text[] NOT NULL DEFAULT '{}',
  last_ip           text,
  last_country      text,
  last_city         text,
  -- Statusi
  is_active         boolean NOT NULL DEFAULT true,
  trust_level       text NOT NULL DEFAULT 'full'
                    CHECK (trust_level IN ('full','limited','watch')),
  -- Kush e miratoi
  approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  approval_method   text, -- 'admin_manual','ai_auto','owner_email'
  -- Koha
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz DEFAULT (now() + INTERVAL '90 days'),
  UNIQUE(user_id, device_fingerprint)
);

-- ── 2. LOG I HYRJEVE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email             text,
  -- Pajisja
  device_fingerprint text,
  device_name       text,
  ip_address        text NOT NULL,
  country           text,
  city              text,
  -- AI Vlerësimi
  risk_score        numeric(3,2) NOT NULL DEFAULT 0.5
                    CHECK (risk_score >= 0 AND risk_score <= 1),
  risk_level        text NOT NULL DEFAULT 'medium'
                    CHECK (risk_level IN ('low','medium','high','critical')),
  risk_factors      text[] NOT NULL DEFAULT '{}',
  -- Rezultati
  outcome           text NOT NULL DEFAULT 'pending'
                    CHECK (outcome IN (
                      'allowed',          -- hyrje e lejuar
                      'blocked',          -- bllokuar nga AI
                      'pending_approval', -- pret miratimin e admin
                      'approved',         -- u miratua nga admin
                      'rejected',         -- u refuzua nga admin
                      'expired'           -- skadoi pa veprim
                    )),
  -- Njoftimi
  admin_notified_at timestamptz,
  admin_notified_ids uuid[],
  resolved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  -- Meta
  user_agent        text,
  session_id        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_user
  ON public.login_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_pending
  ON public.login_attempts(outcome, created_at DESC)
  WHERE outcome = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON public.login_attempts(ip_address, created_at DESC);

-- ── 3. KËRKESAT PENDING PER MIRATIM ─────────────────────────
CREATE TABLE IF NOT EXISTS public.device_approval_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_attempt_id  uuid NOT NULL REFERENCES public.login_attempts(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Të dhënat e kërkesës
  device_name       text NOT NULL,
  ip_address        text NOT NULL,
  country           text,
  risk_level        text NOT NULL,
  risk_factors      text[] NOT NULL DEFAULT '{}',
  ai_recommendation text NOT NULL DEFAULT 'review',
                    -- 'approve','reject','review'
  ai_reasoning      text,
  -- Token i sigurt për veprim nga email
  action_token      text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  -- Statusi
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at        timestamptz NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
  -- Vepruesi
  actioned_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actioned_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_pending
  ON public.device_approval_requests(status, expires_at ASC)
  WHERE status = 'pending';

-- ── 4. SESIONET AKTIVE (për të ditur kush është online) ─────
CREATE TABLE IF NOT EXISTS public.active_admin_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  ip_address        text NOT NULL,
  last_ping_at      timestamptz NOT NULL DEFAULT now(),
  session_token     text NOT NULL,
  UNIQUE(user_id, device_fingerprint)
);

-- Cleanup: fshi sesionte > 30 min pa ping
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM public.active_admin_sessions
  WHERE last_ping_at < now() - INTERVAL '30 minutes';
$$;

-- ── 5. RLS ────────────────────────────────────────────────────
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_admin_sessions ENABLE ROW LEVEL SECURITY;

-- Vetëm user-i sheh pajisjet e veta
CREATE POLICY "own_devices" ON public.trusted_devices
  FOR ALL USING (user_id = auth.uid());

-- Admin sheh të gjitha
CREATE POLICY "admin_sees_all_devices" ON public.trusted_devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "admin_login_attempts" ON public.login_attempts
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "admin_approvals" ON public.device_approval_requests
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ── 6. VIEW: Dashboard sigurisë ──────────────────────────────
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT
  (SELECT COUNT(*) FROM public.device_approval_requests WHERE status='pending') AS pending_approvals,
  (SELECT COUNT(*) FROM public.login_attempts WHERE risk_level IN ('high','critical') AND created_at > now()-INTERVAL '24h') AS high_risk_24h,
  (SELECT COUNT(*) FROM public.login_attempts WHERE outcome='blocked' AND created_at > now()-INTERVAL '24h') AS blocked_24h,
  (SELECT COUNT(*) FROM public.trusted_devices WHERE is_active=true) AS trusted_devices,
  (SELECT COUNT(*) FROM public.active_admin_sessions WHERE last_ping_at > now()-INTERVAL '30min') AS admins_online;
