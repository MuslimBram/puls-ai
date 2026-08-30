-- Security Advisor corrective boundary for legacy asset-duplicate lookup.
-- The helper accepts arbitrary asset identifiers and returns the owning workspace
-- name. It has no canonical runtime call-sites, so browser exposure is unnecessary
-- and creates an asset/workspace reconnaissance oracle.

REVOKE ALL ON FUNCTION public.check_asset_duplicate(text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_asset_duplicate(text, text)
  TO service_role;

COMMENT ON FUNCTION public.check_asset_duplicate(text, text) IS
  'Backend-only duplicate-asset lookup. Browser execution revoked to prevent asset/workspace reconnaissance.';
