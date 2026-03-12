
-- Performance indexes for high-query fields
CREATE INDEX IF NOT EXISTS idx_leads_user_id_message_date ON public.leads(user_id, message_date DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_id_status ON public.leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_user_id_detected_keyword ON public.leads(user_id, detected_keyword);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_user_id_timestamp ON public.inbox_messages(user_id, message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_user_id_status ON public.inbox_messages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_user_id_priority ON public.inbox_messages(user_id, priority);
CREATE INDEX IF NOT EXISTS idx_inbox_user_id_channel_type ON public.inbox_messages(user_id, channel_type);
CREATE INDEX IF NOT EXISTS idx_inbox_channel_id ON public.inbox_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_inbox_lead_id ON public.inbox_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_is_unread ON public.inbox_messages(user_id, is_unread) WHERE is_unread = true;

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON public.channels(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_user_id_type ON public.channels(user_id, channel_type);

CREATE INDEX IF NOT EXISTS idx_keywords_user_id_active ON public.keywords(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

-- Add is_suspended column to profiles for admin user suspension
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

-- Admin RLS policies for write operations on subscriptions
CREATE POLICY "Admins can update all subscriptions" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin RLS policies for user_roles management (update and delete)
CREATE POLICY "Admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can update profiles (for suspension)
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
