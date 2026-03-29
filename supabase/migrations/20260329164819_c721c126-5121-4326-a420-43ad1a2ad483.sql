
-- Custom channel adapters table
CREATE TABLE public.custom_channel_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  adapter_name TEXT NOT NULL,
  adapter_key TEXT NOT NULL UNIQUE,
  provider_api_url TEXT,
  auth_type TEXT NOT NULL DEFAULT 'none',
  auth_credentials JSONB NOT NULL DEFAULT '{}',
  inbound_mapping JSONB NOT NULL DEFAULT '{"text": "message_content", "from": "sender_name", "sender_id": "sender_identifier"}',
  outbound_mapping JSONB NOT NULL DEFAULT '{"message_content": "text", "recipient_identifier": "to"}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.custom_channel_adapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom channel adapters"
ON public.custom_channel_adapters
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER update_custom_channel_adapters_updated_at
  BEFORE UPDATE ON public.custom_channel_adapters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for webhook lookups
CREATE INDEX idx_custom_channel_adapters_key ON public.custom_channel_adapters(adapter_key) WHERE is_active = true;
