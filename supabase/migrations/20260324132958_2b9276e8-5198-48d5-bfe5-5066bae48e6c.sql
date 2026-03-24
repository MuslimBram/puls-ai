
-- Table to track freelancer-business relationships (referral OR management, never both)
CREATE TABLE public.freelancer_business_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('referral', 'management')),
  commission_rate NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'deactivated')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A freelancer can only have ONE type of relation per business
  UNIQUE (freelancer_user_id, business_workspace_id)
);

-- Table for registered assets (websites, channels, groups, social networks) - prevents duplicates
CREATE TABLE public.registered_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('website', 'channel', 'group', 'social_network', 'business_name')),
  asset_identifier TEXT NOT NULL, -- domain, channel handle, group URL, etc.
  asset_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivated_by UUID REFERENCES auth.users(id),
  deactivation_reason TEXT,
  registered_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same asset cannot be registered twice (when active)
  UNIQUE (asset_type, asset_identifier)
);

-- Table for deactivation requests
CREATE TABLE public.asset_deactivation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.registered_assets(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.freelancer_business_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registered_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_deactivation_requests ENABLE ROW LEVEL SECURITY;

-- RLS for freelancer_business_relations
CREATE POLICY "Users can view their own relations" ON public.freelancer_business_relations
  FOR SELECT TO authenticated
  USING (freelancer_user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

CREATE POLICY "Freelancers can create relation requests" ON public.freelancer_business_relations
  FOR INSERT TO authenticated
  WITH CHECK (freelancer_user_id = auth.uid());

CREATE POLICY "Admins can update relations" ON public.freelancer_business_relations
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

-- RLS for registered_assets
CREATE POLICY "Anyone authenticated can view active assets" ON public.registered_assets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can register assets" ON public.registered_assets
  FOR INSERT TO authenticated
  WITH CHECK (registered_by = auth.uid());

CREATE POLICY "Admins can update assets" ON public.registered_assets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

-- RLS for deactivation requests
CREATE POLICY "Users can view their own requests" ON public.asset_deactivation_requests
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

CREATE POLICY "Users can create deactivation requests" ON public.asset_deactivation_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

CREATE POLICY "Admins can update deactivation requests" ON public.asset_deactivation_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'business_owner'));

-- Trigger for updated_at
CREATE TRIGGER update_freelancer_business_relations_updated_at
  BEFORE UPDATE ON public.freelancer_business_relations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_registered_assets_updated_at
  BEFORE UPDATE ON public.registered_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_asset_deactivation_requests_updated_at
  BEFORE UPDATE ON public.asset_deactivation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DB function to check if a freelancer can take a relation with a business
CREATE OR REPLACE FUNCTION public.check_freelancer_relation_eligibility(
  _freelancer_id UUID,
  _business_workspace_id UUID,
  _requested_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing RECORD;
BEGIN
  -- Check if any active/pending relation exists
  SELECT * INTO _existing
  FROM public.freelancer_business_relations
  WHERE freelancer_user_id = _freelancer_id
    AND business_workspace_id = _business_workspace_id
    AND status IN ('active', 'pending');

  IF _existing IS NOT NULL THEN
    IF _existing.relation_type = 'referral' AND _requested_type = 'management' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'Ky biznes është referuar nga ju. Nuk mund ta menaxhoni një biznes që e keni referuar.'
      );
    ELSIF _existing.relation_type = 'management' AND _requested_type = 'referral' THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'Ju tashmë e menaxhoni këtë biznes. Nuk mund të përfitoni komision referimi.'
      );
    ELSE
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'Tashmë keni një marrëdhënie ' || _existing.relation_type || ' me këtë biznes.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- DB function to check if an asset is already registered
CREATE OR REPLACE FUNCTION public.check_asset_duplicate(
  _asset_type TEXT,
  _asset_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _existing RECORD;
BEGIN
  SELECT ra.*, w.name as workspace_name
  INTO _existing
  FROM public.registered_assets ra
  JOIN public.workspaces w ON w.id = ra.workspace_id
  WHERE ra.asset_type = _asset_type
    AND LOWER(ra.asset_identifier) = LOWER(_asset_identifier)
    AND ra.is_active = true;

  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'is_duplicate', true,
      'existing_asset_id', _existing.id,
      'registered_to', _existing.workspace_name,
      'message', 'Ky ' || _asset_type || ' është regjistruar tashmë. Kontaktoni Admin për çaktivizim nëse keni arsye bindëse.'
    );
  END IF;

  RETURN jsonb_build_object('is_duplicate', false);
END;
$$;
