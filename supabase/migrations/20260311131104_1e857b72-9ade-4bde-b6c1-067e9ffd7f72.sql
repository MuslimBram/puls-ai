
-- Inbox messages table for unified inbox
CREATE TABLE public.inbox_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL DEFAULT 'telegram',
  source_name TEXT NOT NULL,
  sender_name TEXT,
  sender_identifier TEXT,
  message_content TEXT NOT NULL,
  message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  intent_score NUMERIC DEFAULT 0,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  matched_keywords TEXT[] DEFAULT '{}',
  is_unread BOOLEAN NOT NULL DEFAULT true,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'new',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inbox messages" ON public.inbox_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own inbox messages" ON public.inbox_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own inbox messages" ON public.inbox_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own inbox messages" ON public.inbox_messages FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all inbox messages" ON public.inbox_messages FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
-- Service role insert policy for edge functions
CREATE POLICY "Service can insert inbox messages" ON public.inbox_messages FOR INSERT TO anon WITH CHECK (true);

-- Reply drafts table
CREATE TABLE public.reply_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  inbox_message_id UUID REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  tone TEXT NOT NULL DEFAULT 'professional',
  reply_content TEXT NOT NULL,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  internal_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reply drafts" ON public.reply_drafts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reply drafts" ON public.reply_drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reply drafts" ON public.reply_drafts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reply drafts" ON public.reply_drafts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Reply templates table
CREATE TABLE public.reply_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'professional',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates" ON public.reply_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Add category column to channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'messaging';
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'disconnected';

-- Channel registry for supported channel types
CREATE TABLE public.channel_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_available BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,
  config_schema JSONB DEFAULT '{}'
);

-- Seed channel registry
INSERT INTO public.channel_registry (id, name, category, description, is_available) VALUES
  ('telegram', 'Telegram', 'messaging', 'Monitor Telegram groups and channels', true),
  ('whatsapp', 'WhatsApp', 'messaging', 'WhatsApp Business API integration', false),
  ('messenger', 'Messenger', 'messaging', 'Facebook Messenger integration', false),
  ('instagram_dm', 'Instagram Direct', 'messaging', 'Instagram Direct Messages', false),
  ('facebook_page', 'Facebook Page', 'social', 'Facebook Page messages', false),
  ('sms', 'SMS', 'messaging', 'SMS messaging integration', false),
  ('viber', 'Viber', 'messaging', 'Viber messaging', false),
  ('discord', 'Discord', 'messaging', 'Discord server monitoring', false),
  ('email', 'Email', 'email', 'Email inbox integration', false),
  ('website_chat', 'Website Chat', 'website', 'Website chat widget', false),
  ('contact_form', 'Contact Form', 'website', 'Website contact form submissions', false),
  ('linkedin', 'LinkedIn', 'social', 'LinkedIn messages placeholder', false),
  ('tiktok', 'TikTok', 'social', 'TikTok lead/comments source', false),
  ('youtube', 'YouTube', 'social', 'YouTube comments source', false),
  ('reddit', 'Reddit', 'social', 'Reddit source', false),
  ('google_business', 'Google Business', 'social', 'Google Business messages', false),
  ('custom_webhook', 'Custom Webhook', 'custom', 'External webhook lead sources', false),
  ('crm_import', 'CRM Import', 'custom', 'CRM data imports', false);

-- Enable realtime on inbox_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;

-- Service role policies for webhook edge functions (telegram-webhook inserts as service role)
CREATE POLICY "Service can insert leads" ON public.leads FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Service can insert inbox" ON public.inbox_messages FOR INSERT TO service_role WITH CHECK (true);
