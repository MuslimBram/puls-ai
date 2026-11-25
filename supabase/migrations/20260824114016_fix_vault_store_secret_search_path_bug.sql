-- Rregullim bug-i real: vault_store_secret s'e gjente gen_random_bytes (është te 'extensions', jo 'public'/'vault').
-- Kjo shpjegon pse vault_secret_refs ishte gjithmonë 0 rreshta -- funksioni s'ka funksionuar kurrë deri tani.
CREATE OR REPLACE FUNCTION public.vault_store_secret(_workspace_id uuid, _integration_key text, _secret_value text, _label text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions'
AS $function$
DECLARE
  _is_authorized boolean := false;
  _vault_id uuid;
  _vault_name text;
  _ref_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (_workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), _workspace_id))
  ) INTO _is_authorized;

  IF NOT _is_authorized THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, metadata)
    VALUES (auth.uid(), 'vault_secret_store_denied', 'vault_secret',
      jsonb_build_object('workspace_id', _workspace_id, 'integration_key', _integration_key));
    RAISE EXCEPTION 'Insufficient permissions to store secret' USING ERRCODE = '42501';
  END IF;

  IF _secret_value IS NULL OR length(_secret_value) < 4 THEN
    RAISE EXCEPTION 'Secret value is required';
  END IF;
  IF _integration_key IS NULL OR length(trim(_integration_key)) = 0 THEN
    RAISE EXCEPTION 'integration_key is required';
  END IF;

  _vault_name := 'pulsi_' || COALESCE(_workspace_id::text, 'global') || '_' || _integration_key || '_' || encode(extensions.gen_random_bytes(6), 'hex');

  SELECT vault.create_secret(_secret_value, _vault_name, COALESCE(_label, _integration_key)) INTO _vault_id;

  INSERT INTO public.vault_secret_refs (workspace_id, integration_key, label, vault_secret_name, created_by)
  VALUES (_workspace_id, _integration_key, _label, _vault_name, auth.uid())
  RETURNING id INTO _ref_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'vault_secret_created', 'vault_secret', _ref_id::text,
    jsonb_build_object('workspace_id', _workspace_id, 'integration_key', _integration_key, 'label', _label));

  RETURN jsonb_build_object('vault_secret_id', _vault_id, 'vault_secret_name', _vault_name);
END;
$function$;;
