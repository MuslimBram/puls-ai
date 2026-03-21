
-- Fix: Assign 'business_owner' role to all existing workspace owners who only have 'user' role
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT w.owner_id, 'business_owner'::app_role
FROM public.workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = w.owner_id AND ur.role = 'business_owner'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Update handle_new_user to assign business_owner role instead of just user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_workspace_id UUID;
  ref_code TEXT;
  ref_partner_id UUID;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Check for referral code
  ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF ref_code IS NOT NULL AND ref_code != '' THEN
    SELECT id INTO ref_partner_id
    FROM public.partner_accounts
    WHERE referral_code = ref_code AND status = 'active';
  END IF;
  
  -- Create default workspace
  INSERT INTO public.workspaces (name, owner_id, referred_by_partner_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'),
    NEW.id,
    ref_partner_id
  )
  RETURNING id INTO new_workspace_id;
  
  -- Add owner as workspace member
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');
  
  -- Create subscription linked to workspace
  INSERT INTO public.subscriptions (user_id, workspace_id)
  VALUES (NEW.id, new_workspace_id);
  
  -- Assign business_owner role (full access to their workspace)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner');
  
  -- Update partner stats if referral
  IF ref_partner_id IS NOT NULL THEN
    UPDATE public.partner_accounts
    SET total_businesses = total_businesses + 1, updated_at = now()
    WHERE id = ref_partner_id;
  END IF;
  
  RETURN NEW;
END;
$function$;
