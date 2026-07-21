-- ============================================================================
-- 1) Extend bootstrap_user_account_for so that two designated owner emails
--    always receive 'super_admin' (in addition to the normal 'business_owner'
--    role every signup gets). This runs on every login via
--    ensure_current_user_bootstrap(), so it self-heals even if the role was
--    ever removed, and it applies the moment the account first registers.
-- ============================================================================
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
  v_email text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  SELECT
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')), ''),
    NULLIF(TRIM(COALESCE(u.raw_user_meta_data->>'referral_code', '')), ''),
    COALESCE(NULLIF(SPLIT_PART(u.email, '@', 1), ''), 'My Workspace'),
    LOWER(TRIM(u.email))
  INTO v_full_name, v_avatar_url, v_ref_code, v_workspace_name, v_email
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

  -- Designated platform owners: always carry super_admin, self-healing on every login.
  IF v_email IN ('muslim.brami@gmail.com', 'info@mso.re') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- ============================================================================
-- 2) Immediately grant super_admin to either designated email if their auth
--    account already exists today (covers the "already registered" case;
--    the function above covers all future logins/signups).
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM auth.users
    WHERE LOWER(TRIM(email)) IN ('muslim.brami@gmail.com', 'info@mso.re')
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================================================
-- 3) Allow workspace Owners (role = 'business_owner') to manage roles too,
--    not just platform admin/super_admin. An Owner can promote someone
--    (including themselves) to 'admin', and can move themselves back down
--    from 'admin' to plain business_owner. Owners cannot grant 'super_admin'
--    or touch other super_admins' rows — that stays platform-admin-only.
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins and owners can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'business_owner'::app_role)
      AND role = 'admin'::app_role
    )
  );

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins and owners can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'business_owner'::app_role)
      AND role IN ('admin'::app_role, 'business_owner'::app_role)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'business_owner'::app_role)
      AND role IN ('admin'::app_role, 'business_owner'::app_role)
    )
  );

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins and owners can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'business_owner'::app_role)
      AND role = 'admin'::app_role
    )
  );

-- ============================================================================
-- 4) Backfill: re-run bootstrap for every existing user so the new
--    super_admin grant takes effect immediately, without waiting for next login.
-- ============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM auth.users LOOP
    PERFORM public.bootstrap_user_account_for(r.id);
  END LOOP;
END;
$$;
