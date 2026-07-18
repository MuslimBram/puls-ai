-- supabase/migrations/0159_business_admin_self_management.sql
-- ============================================================
-- Business Admin mund të shtojë vetë biznesin dhe stafin
-- Owner/Admin kanë akses të plotë
-- ============================================================

-- ── 1. BUSINESS INVITATIONS (Admin biznesi fton staf) ─────────
CREATE TABLE IF NOT EXISTS public.business_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL,
  invited_email   text NOT NULL,
  invited_role    text NOT NULL DEFAULT 'agent'
                  CHECK (invited_role IN ('admin','freelancer','agent','ambassador')),
  invited_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex'),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','expired','cancelled')),
  message         text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;

-- Business admin/owner mund të ftojë
CREATE POLICY "business_admin_can_invite" ON public.business_invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','super_admin','business_owner')
    )
  );

-- ── 2. PERMISSION OVERRIDES (granular access per business) ────
CREATE TABLE IF NOT EXISTS public.business_permission_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission    text NOT NULL,
  -- p.sh. 'can_view_analytics', 'can_manage_billing', 'can_invite_staff'
  granted       boolean NOT NULL DEFAULT true,
  granted_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id, permission)
);

ALTER TABLE public.business_permission_overrides ENABLE ROW LEVEL SECURITY;

-- ── 3. FUNKSIONI: kontrollo aksesin ───────────────────────────
CREATE OR REPLACE FUNCTION public.has_business_access(
  p_user_id    uuid,
  p_business_id uuid,
  p_permission text DEFAULT 'view'
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_has_override boolean;
BEGIN
  -- Owner dhe Admin kanë gjithmonë akses
  SELECT role INTO v_role FROM public.user_roles
  WHERE user_id = p_user_id AND role IN ('super_admin','admin')
  LIMIT 1;
  IF FOUND THEN RETURN true; END IF;

  -- Kontrollo override specifik
  SELECT granted INTO v_has_override
  FROM public.business_permission_overrides
  WHERE user_id = p_user_id
    AND business_id = p_business_id
    AND permission = p_permission;
  IF FOUND THEN RETURN v_has_override; END IF;

  -- Kontrollo membership të biznesit
  IF EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = p_user_id AND workspace_id = p_business_id
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$;

-- ── 4. VIEW: Aksesi i plotë per Owner/Admin ────────────────────
CREATE OR REPLACE VIEW public.platform_full_access AS
SELECT
  u.id AS user_id,
  u.email,
  ur.role,
  ur.role IN ('super_admin','admin') AS has_full_access,
  (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.user_id = u.id) AS businesses_count,
  (SELECT COUNT(*) FROM public.business_invitations bi
   WHERE bi.invited_by = u.id AND bi.status = 'pending') AS pending_invitations
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.role IS NOT NULL;

-- ── 5. TRIGGER: Owner/Admin marrin automatikisht akses ────────
CREATE OR REPLACE FUNCTION public.grant_admin_full_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Nëse roli është admin/super_admin, shto te të gjitha workspaces
  IF NEW.role IN ('admin', 'super_admin') THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT id, NEW.user_id, 'admin'
    FROM public.workspaces
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_full_access ON public.user_roles;
CREATE TRIGGER trg_admin_full_access
  AFTER INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  WHEN (NEW.role IN ('admin','super_admin'))
  EXECUTE FUNCTION public.grant_admin_full_access();

