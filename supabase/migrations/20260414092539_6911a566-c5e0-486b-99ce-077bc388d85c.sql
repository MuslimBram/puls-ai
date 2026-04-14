
-- Unified connections table
CREATE TABLE public.unified_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.business_profiles(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  connection_type TEXT NOT NULL DEFAULT 'api_key' CHECK (connection_type IN ('oauth', 'api_key', 'bot_token', 'webhook', 'credentials')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected', 'expired')),
  display_name TEXT,
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  config_json JSONB NOT NULL DEFAULT '{}',
  credentials_encrypted JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.unified_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own connections"
  ON public.unified_connections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all connections"
  ON public.unified_connections FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_unified_connections_user ON public.unified_connections(user_id);
CREATE INDEX idx_unified_connections_provider ON public.unified_connections(provider);
CREATE INDEX idx_unified_connections_business ON public.unified_connections(business_id);

CREATE TRIGGER update_unified_connections_updated_at
  BEFORE UPDATE ON public.unified_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Connection logs table
CREATE TABLE public.connection_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID REFERENCES public.unified_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.connection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own connection logs"
  ON public.connection_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all connection logs"
  ON public.connection_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users insert own connection logs"
  ON public.connection_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_connection_logs_connection ON public.connection_logs(connection_id);
CREATE INDEX idx_connection_logs_user ON public.connection_logs(user_id);
CREATE INDEX idx_connection_logs_created ON public.connection_logs(created_at DESC);

-- n8n configuration table
CREATE TABLE public.n8n_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  base_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  event_mappings JSONB NOT NULL DEFAULT '{"new_lead": null, "new_message": null, "form_submit": null, "payment_success": null}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.n8n_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace owners manage n8n config"
  ON public.n8n_configurations FOR ALL
  USING (
    public.is_workspace_owner(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    public.is_workspace_owner(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER update_n8n_configurations_updated_at
  BEFORE UPDATE ON public.n8n_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
