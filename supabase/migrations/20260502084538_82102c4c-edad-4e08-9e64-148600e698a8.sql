-- ============================================
-- Vault-backed secret storage for new credentials
-- ============================================

-- Table that stores ONLY a reference to a secret in vault.secrets.
-- The secret value itself never leaves vault.
CREATE TABLE IF NOT EXISTS public.vault_secret_refs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_key text NOT NULL,
  label text,
  vault_secret_name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_secret_refs_workspace
  ON public.vault_secret_refs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vault_secret_refs_integration
  ON public.vault_secret_refs(integration_key);

ALTER TABLE public.vault_secret_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace owners and admins can manage vault refs" ON public.vault_secret_refs;
CREATE POLICY "Workspace owners and admins can manage vault refs"
  ON public.vault_secret_refs
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), workspace_id))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), workspace_id))
  );

DROP TRIGGER IF EXISTS set_vault_secret_refs_updated_at ON public.vault_secret_refs;
CREATE TRIGGER set_vault_secret_refs_updated_at
  BEFORE UPDATE ON public.vault_secret_refs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- vault_store_secret: write a secret to vault and persist only its name.
-- Returns the vault secret id (uuid) and the generated unique name.
-- Owner / admin only.
-- ============================================
CREATE OR REPLACE FUNCTION public.vault_store_secret(
  _workspace_id uuid,
  _integration_key text,
  _secret_value text,
  _label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _is_authorized boolean := false;
  _vault_id uuid;
  _vault_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (_workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), _workspace_id))
  )
  INTO _is_authorized;

  IF NOT _is_authorized THEN
    RAISE EXCEPTION 'Insufficient permissions to store secret';
  END IF;

  IF _secret_value IS NULL OR length(_secret_value) < 4 THEN
    RAISE EXCEPTION 'Secret value is required';
  END IF;

  _vault_name := 'pulsi_'
    || COALESCE(_workspace_id::text, 'global') || '_'
    || _integration_key || '_'
    || encode(gen_random_bytes(6), 'hex');

  -- Store in vault. vault.create_secret(secret, name, description)
  SELECT vault.create_secret(_secret_value, _vault_name, COALESCE(_label, _integration_key))
  INTO _vault_id;

  INSERT INTO public.vault_secret_refs (
    workspace_id, integration_key, label, vault_secret_name, created_by
  ) VALUES (
    _workspace_id, _integration_key, _label, _vault_name, auth.uid()
  );

  RETURN jsonb_build_object(
    'vault_secret_id', _vault_id,
    'vault_secret_name', _vault_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vault_store_secret(uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vault_store_secret(uuid, text, text, text) TO authenticated;

-- ============================================
-- vault_read_secret: read a decrypted secret value by name.
-- ONLY service_role can call this (used by edge functions).
-- ============================================
CREATE OR REPLACE FUNCTION public.vault_read_secret(_vault_secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _value text;
BEGIN
  SELECT decrypted_secret INTO _value
  FROM vault.decrypted_secrets
  WHERE name = _vault_secret_name
  LIMIT 1;
  RETURN _value;
END;
$$;

-- Lock down: only service_role can read raw secrets.
REVOKE ALL ON FUNCTION public.vault_read_secret(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_read_secret(text) TO service_role;

-- ============================================
-- vault_delete_secret: remove a secret + its reference. Owner/admin only.
-- ============================================
CREATE OR REPLACE FUNCTION public.vault_delete_secret(_vault_secret_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _ref RECORD;
  _is_authorized boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _ref
  FROM public.vault_secret_refs
  WHERE vault_secret_name = _vault_secret_name;

  IF _ref IS NULL THEN
    RETURN false;
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (_ref.workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), _ref.workspace_id))
  )
  INTO _is_authorized;

  IF NOT _is_authorized THEN
    RAISE EXCEPTION 'Insufficient permissions to delete secret';
  END IF;

  DELETE FROM vault.secrets WHERE name = _vault_secret_name;
  DELETE FROM public.vault_secret_refs WHERE vault_secret_name = _vault_secret_name;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_delete_secret(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(text) TO authenticated;