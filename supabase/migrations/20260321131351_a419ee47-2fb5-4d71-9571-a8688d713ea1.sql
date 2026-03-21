
-- IP blocklist for brute-force protection
CREATE TABLE IF NOT EXISTS public.ip_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  reason text,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid,
  workspace_id uuid REFERENCES public.workspaces(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_blocklist" ON public.ip_blocklist
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_ip_blocklist_ip ON public.ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_expires ON public.ip_blocklist(expires_at) WHERE expires_at IS NOT NULL;

-- Function to auto-block IPs with too many failed logins
CREATE OR REPLACE FUNCTION public.auto_block_brute_force()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _fail_count int;
BEGIN
  IF NEW.event_type = 'login_failed' AND NEW.ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO _fail_count
    FROM public.security_events
    WHERE ip_address = NEW.ip_address
      AND event_type = 'login_failed'
      AND created_at > now() - interval '30 minutes';

    IF _fail_count >= 10 THEN
      INSERT INTO public.ip_blocklist (ip_address, reason, expires_at)
      VALUES (
        NEW.ip_address,
        'Auto-blocked: ' || _fail_count || ' failed logins in 30 min',
        now() + interval '1 hour'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on security_events
DROP TRIGGER IF EXISTS trg_auto_block_brute_force ON public.security_events;
CREATE TRIGGER trg_auto_block_brute_force
  AFTER INSERT ON public.security_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_block_brute_force();

-- Security scan results table
CREATE TABLE IF NOT EXISTS public.security_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_time timestamptz NOT NULL DEFAULT now(),
  findings_count int NOT NULL DEFAULT 0,
  critical_count int NOT NULL DEFAULT 0,
  high_count int NOT NULL DEFAULT 0,
  medium_count int NOT NULL DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_scan_results" ON public.security_scan_results
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
