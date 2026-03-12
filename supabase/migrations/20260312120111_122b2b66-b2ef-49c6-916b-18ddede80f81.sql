
-- Partner accounts table
CREATE TABLE public.partner_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  partner_name TEXT NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 30,
  billing_model TEXT NOT NULL DEFAULT 'partner_pays',
  status TEXT NOT NULL DEFAULT 'pending',
  total_businesses INTEGER DEFAULT 0,
  monthly_revenue NUMERIC DEFAULT 0,
  commission_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Partner-managed businesses
CREATE TABLE public.partner_businesses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(partner_id, workspace_id)
);

-- Session/device management
CREATE TABLE public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_info JSONB DEFAULT '{}'::JSONB,
  ip_address TEXT,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Partner accounts RLS
CREATE POLICY "Users can view own partner account" ON public.partner_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own partner account" ON public.partner_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own partner account" ON public.partner_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all partner accounts" ON public.partner_accounts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update all partner accounts" ON public.partner_accounts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Partner businesses RLS
CREATE POLICY "Partners can view own businesses" ON public.partner_businesses FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = partner_id AND pa.user_id = auth.uid()));
CREATE POLICY "Partners can add businesses" ON public.partner_businesses FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = partner_id AND pa.user_id = auth.uid()));
CREATE POLICY "Partners can remove businesses" ON public.partner_businesses FOR DELETE TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = partner_id AND pa.user_id = auth.uid()));

-- User sessions RLS
CREATE POLICY "Users can view own sessions" ON public.user_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.user_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.user_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.user_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Triggers
CREATE TRIGGER update_partner_accounts_updated_at BEFORE UPDATE ON public.partner_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
