
REVOKE EXECUTE ON FUNCTION public.vault_store_secret(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_read_secret(text) FROM PUBLIC, anon;

REVOKE ALL ON public.vault_secret_refs FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vault_secret_refs TO authenticated;
GRANT ALL ON public.vault_secret_refs TO service_role;

CREATE OR REPLACE FUNCTION public.vault_read_secret(_vault_secret_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  _ref RECORD;
  _is_authorized boolean := false;
  _value text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ref FROM public.vault_secret_refs WHERE vault_secret_name = _vault_secret_name;
  IF _ref IS NULL THEN
    RAISE EXCEPTION 'Secret not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (_ref.workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), _ref.workspace_id))
  ) INTO _is_authorized;

  IF NOT _is_authorized THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vault_secret_read_denied', 'vault_secret', _ref.id::text,
      jsonb_build_object('workspace_id', _ref.workspace_id, 'integration_key', _ref.integration_key));
    RAISE EXCEPTION 'Insufficient permissions to read secret' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO _value FROM vault.decrypted_secrets WHERE name = _vault_secret_name LIMIT 1;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'vault_secret_read', 'vault_secret', _ref.id::text,
    jsonb_build_object('workspace_id', _ref.workspace_id, 'integration_key', _ref.integration_key));

  RETURN _value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vault_store_secret(_workspace_id uuid, _integration_key text, _secret_value text, _label text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
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

  _vault_name := 'pulsi_' || COALESCE(_workspace_id::text, 'global') || '_' || _integration_key || '_' || encode(gen_random_bytes(6), 'hex');

  SELECT vault.create_secret(_secret_value, _vault_name, COALESCE(_label, _integration_key)) INTO _vault_id;

  INSERT INTO public.vault_secret_refs (workspace_id, integration_key, label, vault_secret_name, created_by)
  VALUES (_workspace_id, _integration_key, _label, _vault_name, auth.uid())
  RETURNING id INTO _ref_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'vault_secret_created', 'vault_secret', _ref_id::text,
    jsonb_build_object('workspace_id', _workspace_id, 'integration_key', _integration_key, 'label', _label));

  RETURN jsonb_build_object('vault_secret_id', _vault_id, 'vault_secret_name', _vault_name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(_vault_secret_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  _ref RECORD;
  _is_authorized boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _ref FROM public.vault_secret_refs WHERE vault_secret_name = _vault_secret_name;
  IF _ref IS NULL THEN
    RETURN false;
  END IF;

  SELECT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR (_ref.workspace_id IS NOT NULL AND public.is_workspace_owner(auth.uid(), _ref.workspace_id))
  ) INTO _is_authorized;

  IF NOT _is_authorized THEN
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'vault_secret_delete_denied', 'vault_secret', _ref.id::text,
      jsonb_build_object('workspace_id', _ref.workspace_id, 'integration_key', _ref.integration_key));
    RAISE EXCEPTION 'Insufficient permissions to delete secret' USING ERRCODE = '42501';
  END IF;

  DELETE FROM vault.secrets WHERE name = _vault_secret_name;
  DELETE FROM public.vault_secret_refs WHERE vault_secret_name = _vault_secret_name;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'vault_secret_deleted', 'vault_secret', _ref.id::text,
    jsonb_build_object('workspace_id', _ref.workspace_id, 'integration_key', _ref.integration_key, 'vault_secret_name', _vault_secret_name));

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.vault_store_secret(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vault_read_secret(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.vault_store_secret(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vault_read_secret(text) TO authenticated, service_role;
