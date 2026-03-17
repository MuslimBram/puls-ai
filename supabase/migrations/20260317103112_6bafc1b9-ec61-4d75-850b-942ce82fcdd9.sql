
-- Broadcast unsubscribe tokens for one-click unsubscribe links
CREATE TABLE public.broadcast_unsubscribe_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  broadcast_id UUID REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  contact_identifier TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'email',
  user_id UUID NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.broadcast_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own unsub tokens"
  ON public.broadcast_unsubscribe_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create unsub tokens"
  ON public.broadcast_unsubscribe_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_unsub_token ON public.broadcast_unsubscribe_tokens(token);
CREATE INDEX idx_unsub_broadcast ON public.broadcast_unsubscribe_tokens(broadcast_id);

-- Dynamic Stripe product-to-plan mapping table
CREATE TABLE public.stripe_product_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_product_id TEXT NOT NULL UNIQUE,
  plan_name TEXT NOT NULL,
  monthly_price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_product_plans ENABLE ROW LEVEL SECURITY;

-- Only admins can manage stripe product plans
CREATE POLICY "Admins can manage stripe plans"
  ON public.stripe_product_plans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed existing products
INSERT INTO public.stripe_product_plans (stripe_product_id, plan_name, monthly_price) VALUES
  ('prod_U8LrDc0TasNxNH', 'standard', 29),
  ('prod_U8Qdd9foXaeqnn', 'standard', 29),
  ('prod_U8Lr5611OwyJSV', 'professional', 79),
  ('prod_U8LrRodC8eZsTT', 'advanced', 149),
  ('prod_U8LsXPlxbqhpmK', 'enterprise', 399)
ON CONFLICT (stripe_product_id) DO NOTHING;

-- Add trigger for updated_at
CREATE TRIGGER update_stripe_product_plans_updated_at
  BEFORE UPDATE ON public.stripe_product_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
