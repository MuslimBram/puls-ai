
-- Subscription package extensions
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS package_type text DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS package_duration_months integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS package_discount_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS package_start_at timestamptz,
ADD COLUMN IF NOT EXISTS package_end_at timestamptz,
ADD COLUMN IF NOT EXISTS referral_eligible boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS referral_eligible_at timestamptz,
ADD COLUMN IF NOT EXISTS qualifying_package_type text,
ADD COLUMN IF NOT EXISTS images_generated_this_month integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS videos_generated_this_month integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS media_reset_at timestamptz DEFAULT now();

-- Media generations tracking
CREATE TABLE IF NOT EXISTS public.media_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  duration_seconds integer,
  prompt text,
  result_url text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.media_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own media_generations" ON public.media_generations
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Media add-on packs
CREATE TABLE IF NOT EXISTS public.media_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  addon_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 10,
  remaining integer NOT NULL DEFAULT 10,
  price_paid numeric DEFAULT 0,
  purchased_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

ALTER TABLE public.media_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own media_addons" ON public.media_addons
FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Business registrations (worker review flow)
CREATE TABLE IF NOT EXISTS public.business_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  industry text,
  business_data jsonb DEFAULT '{}',
  package_type text DEFAULT 'monthly',
  discount_applied numeric DEFAULT 0,
  discount_reason text,
  referral_code_used text,
  review_status text DEFAULT 'draft',
  review_notes text,
  created_by_user_id uuid NOT NULL,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.business_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workers can view own or admin controller view all" ON public.business_registrations
FOR SELECT TO authenticated USING (
  created_by_user_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'controller')
);

CREATE POLICY "Workers and admins can insert registrations" ON public.business_registrations
FOR INSERT TO authenticated WITH CHECK (
  created_by_user_id = auth.uid()
  AND (has_role(auth.uid(), 'worker') OR has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Admins controllers and creators can update" ON public.business_registrations
FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'controller')
  OR (created_by_user_id = auth.uid() AND review_status IN ('draft', 'needs_changes'))
);

-- Discount audit log
CREATE TABLE IF NOT EXISTS public.discount_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  registration_id uuid REFERENCES public.business_registrations(id),
  action text NOT NULL,
  actor_id uuid NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.discount_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and controllers can view discount_audit_log" ON public.discount_audit_log
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'controller')
);

CREATE POLICY "Authenticated can insert discount_audit_log" ON public.discount_audit_log
FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- Platform roadmap placeholders
CREATE TABLE IF NOT EXISTS public.platform_roadmap (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'planned',
  priority text DEFAULT 'medium',
  target_phase text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.platform_roadmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage roadmap" ON public.platform_roadmap
FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_media_generations_workspace ON public.media_generations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_registrations_status ON public.business_registrations(review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_registrations_creator ON public.business_registrations(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_discount_audit_log_registration ON public.discount_audit_log(registration_id);
