-- Aksesor i brendshëm Vault, VETËM për service_role (edge functions/webhooks pa user të loguar).
-- I ndarë nga vault_read_secret (ai është për thirrje nga UI-të e përdoruesve, kërkon auth.uid()+RBAC).
CREATE OR REPLACE FUNCTION public.vault_read_secret_internal(_vault_secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  _value text;
BEGIN
  SELECT decrypted_secret INTO _value FROM vault.decrypted_secrets WHERE name = _vault_secret_name LIMIT 1;
  RETURN _value;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_read_secret_internal(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_read_secret_internal(text) TO service_role;;
