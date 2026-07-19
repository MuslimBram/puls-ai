
-- Restrict roles that can be inserted/updated into workspace_members
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('owner','admin','member','viewer'));

DROP POLICY IF EXISTS "Owners can manage members" ON public.workspace_members;

-- Owners can insert members but cannot assign the 'owner' role themselves
CREATE POLICY "Owners can insert non-owner members"
ON public.workspace_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_workspace_owner(workspace_id, auth.uid())
  AND role IN ('admin','member','viewer')
);

CREATE POLICY "Owners can update non-owner members"
ON public.workspace_members
FOR UPDATE
TO authenticated
USING (public.is_workspace_owner(workspace_id, auth.uid()))
WITH CHECK (
  public.is_workspace_owner(workspace_id, auth.uid())
  AND role IN ('admin','member','viewer')
);

CREATE POLICY "Owners can delete non-owner members"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  public.is_workspace_owner(workspace_id, auth.uid())
  AND role <> 'owner'
);

-- Revoke public/anon execute on the trigger helper (should never be user-callable)
REVOKE EXECUTE ON FUNCTION public.api_keys_block_privilege_escalation() FROM anon, PUBLIC;
