-- supabase/migrations/0146_owner_auto_assign.sql
-- ============================================================
-- P1 FIX: Owner auto-assign
-- Kur muslim.brami@gmail.com ose info@mso.re regjistrohen,
-- marrin automatikisht rolin super_admin.
-- ============================================================

-- 1. Tabela e email-ave të admin-it (e konfigurueshme pa ndryshim kodi)
CREATE TABLE IF NOT EXISTS public.platform_admin_emails (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  role       text NOT NULL DEFAULT 'super_admin',
  added_by   text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admin_emails ENABLE ROW LEVEL SECURITY;

-- Vetëm super_admin mund të lexojë/modifikojë
CREATE POLICY "admin_emails_super_admin_only" ON public.platform_admin_emails
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 2. Vendos email-at e pronarit
INSERT INTO public.platform_admin_emails (email, role, added_by) VALUES
  ('muslim.brami@gmail.com', 'super_admin', 'system_init'),
  ('info@mso.re',            'super_admin', 'system_init')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;

-- 3. Funksioni trigger: ekzekutohet pas çdo regjistrimi
CREATE OR REPLACE FUNCTION public.handle_new_user_admin_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Kontrollo nëse email i ri është në listën e admin-ave
  SELECT role INTO v_role
  FROM public.platform_admin_emails
  WHERE LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    -- Shto rolin super_admin
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Shto gjithashtu rolin bazë 'admin' nëse s'e ka
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Log për audit
    RAISE LOG 'Owner auto-assign: user % (%) u caktua si %',
      NEW.id, NEW.email, v_role;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Lidh triggerin me auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_admin_check ON auth.users;
CREATE TRIGGER on_auth_user_created_admin_check
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_admin_check();

-- 5. Ekzekuto menjëherë për users ekzistues (nëse janë regjistruar tashmë)
DO $$
DECLARE
  v_user_id uuid;
  v_email   text;
  v_role    text;
BEGIN
  FOR v_user_id, v_email IN
    SELECT au.id, au.email
    FROM auth.users au
    INNER JOIN public.platform_admin_emails pae
      ON LOWER(au.email) = LOWER(pae.email)
  LOOP
    SELECT role INTO v_role
    FROM public.platform_admin_emails
    WHERE LOWER(email) = LOWER(v_email);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, v_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    RAISE NOTICE 'Retroactive admin assign: % → %', v_email, v_role;
  END LOOP;
END;
$$;
