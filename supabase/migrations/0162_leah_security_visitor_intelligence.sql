-- LEAH / Pulse AI visitor security foundation.
-- Review before production deployment. No existing tables are modified destructively.

CREATE TABLE IF NOT EXISTS public.leah_visitor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  visitor_key text NOT NULL,
  country_code text,
  device_type text,
  browser_family text,
  source text,
  referrer text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer NOT NULL DEFAULT 0,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  moderation_state text NOT NULL DEFAULT 'allowed' CHECK (moderation_state IN ('allowed','reviewing','blocked','approved','spam','trash')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leah_visitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.leah_visitor_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  route text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leah_security_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  session_id uuid REFERENCES public.leah_visitor_sessions(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('approve','unapprove','mark_spam','move_trash','temporary_block','release_block')),
  reason text,
  risk_score integer CHECK (risk_score BETWEEN 0 AND 100),
  actor_type text NOT NULL CHECK (actor_type IN ('ai','admin','owner','system')),
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leah_security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  session_id uuid REFERENCES public.leah_visitor_sessions(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('medium','high','critical')),
  title text NOT NULL,
  message text NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leah_visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leah_visitor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leah_security_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leah_security_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_leah_visitor_sessions_workspace_last_seen ON public.leah_visitor_sessions(workspace_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_leah_visitor_events_workspace_created ON public.leah_visitor_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leah_security_alerts_workspace_created ON public.leah_security_alerts(workspace_id, created_at DESC);
