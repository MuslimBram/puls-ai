ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ambassador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'white_label';

COMMENT ON TYPE public.app_role IS 'Pulse roles: super_admin=Owner, admin=Pulse AI Admin, business_owner=Business Admin, freelancer=Freelancer, ambassador=Ambassador, white_label=White-Label Partner. Legacy operational roles remain for compatibility.';
