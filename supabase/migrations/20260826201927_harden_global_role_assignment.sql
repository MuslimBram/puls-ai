-- Harden global role assignment boundaries.
-- Workspace owners manage owner/admin/member/viewer in workspace_members;
-- they must never grant platform roles through public.user_roles.

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND role = ANY (
      ARRAY[
        'admin'::public.app_role,
        'controller'::public.app_role,
        'worker'::public.app_role,
        'moderator'::public.app_role,
        'support_agent'::public.app_role,
        'staff'::public.app_role,
        'accountant'::public.app_role
      ]
    )
  )
);

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND role = ANY (
      ARRAY[
        'admin'::public.app_role,
        'controller'::public.app_role,
        'worker'::public.app_role,
        'moderator'::public.app_role,
        'support_agent'::public.app_role,
        'staff'::public.app_role,
        'accountant'::public.app_role
      ]
    )
  )
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND role = ANY (
      ARRAY[
        'admin'::public.app_role,
        'controller'::public.app_role,
        'worker'::public.app_role,
        'moderator'::public.app_role,
        'support_agent'::public.app_role,
        'staff'::public.app_role,
        'accountant'::public.app_role
      ]
    )
  )
);

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR (
    public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    AND role = ANY (
      ARRAY[
        'admin'::public.app_role,
        'controller'::public.app_role,
        'worker'::public.app_role,
        'moderator'::public.app_role,
        'support_agent'::public.app_role,
        'staff'::public.app_role,
        'accountant'::public.app_role
      ]
    )
  )
);

COMMENT ON TABLE public.user_roles IS
  'Global platform roles only. Business workspace roles belong in public.workspace_members.';
