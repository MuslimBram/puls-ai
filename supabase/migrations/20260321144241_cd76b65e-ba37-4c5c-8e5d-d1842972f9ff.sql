-- Bootstrap helper for existing/new authenticated users without relying on auth schema triggers
CREATE OR REPLACE FUNCTION public.bootstrap_user_account_for(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
  v_full_name text;
  v_avatar_url text;
  v_workspace_name text;
  v_ref_code text;
  v_ref_partner_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  SELECT
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'referral_code', '')), ''),
    COALESCE(NULLIF(SPLIT_PART(u.email, '@', 1), ''), 'My Workspace')
  INTO v_full_name, v_avatar_url, v_ref_code, v_workspace_name
  FROM auth.users u
  WHERE u.id = _user_id;

  IF v_full_name IS NULL THEN
    v_full_name := v_workspace_name;
  END IF;

  IF v_ref_code IS NOT NULL THEN
    SELECT id
    INTO v_ref_partner_id
    FROM public.partner_accounts
    WHERE referral_code = v_ref_code
      AND status = 'active'
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (_user_id, v_full_name, v_avatar_url)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);

  SELECT id
  INTO v_workspace_id
  FROM public.workspaces
  WHERE owner_id = _user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    INSERT INTO public.workspaces (name, owner_id, referred_by_partner_id)
    VALUES (COALESCE(v_full_name, 'My Workspace'), _user_id, v_ref_partner_id)
    RETURNING id INTO v_workspace_id;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, _user_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE
  SET role = 'owner';

  INSERT INTO public.subscriptions (user_id, workspace_id, referred_by_partner_id)
  VALUES (_user_id, v_workspace_id, v_ref_partner_id)
  ON CONFLICT (user_id) DO UPDATE
  SET workspace_id = COALESCE(public.subscriptions.workspace_id, EXCLUDED.workspace_id),
      referred_by_partner_id = COALESCE(public.subscriptions.referred_by_partner_id, EXCLUDED.referred_by_partner_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'user'), (_user_id, 'business_owner')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Authenticated caller wrapper (self-only)
CREATE OR REPLACE FUNCTION public.ensure_current_user_bootstrap()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.bootstrap_user_account_for(v_user_id);
END;
$$;

-- Limit who can call the internal helper
REVOKE ALL ON FUNCTION public.bootstrap_user_account_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_bootstrap() TO authenticated;

-- Backfill all existing users so owner/admin gating works immediately
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM auth.users LOOP
    PERFORM public.bootstrap_user_account_for(r.id);
  END LOOP;
END;
$$;