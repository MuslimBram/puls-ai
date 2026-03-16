
-- Add referral_code to partner_accounts
ALTER TABLE public.partner_accounts 
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Add referred_by_partner_id to workspaces
ALTER TABLE public.workspaces 
  ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid REFERENCES public.partner_accounts(id) ON DELETE SET NULL;

-- Auto-generate referral code when partner is created
CREATE OR REPLACE FUNCTION public.generate_partner_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'P' || upper(substr(md5(NEW.id::text || now()::text), 1, 7));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_partner_referral_code
  BEFORE INSERT ON public.partner_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_partner_referral_code();

-- Backfill existing partners with referral codes
UPDATE public.partner_accounts 
SET referral_code = 'P' || upper(substr(md5(id::text || now()::text), 1, 7))
WHERE referral_code IS NULL;

-- Update handle_new_user to link referral
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  -- Assign user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  -- Update partner stats if referral
  IF ref_partner_id IS NOT NULL THEN
    UPDATE public.partner_accounts
    SET total_businesses = total_businesses + 1, updated_at = now()
    WHERE id = ref_partner_id;
  END IF;
  
  RETURN NEW;
END;
$$;
