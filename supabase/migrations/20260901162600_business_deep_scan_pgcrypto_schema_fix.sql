-- Supabase installs pgcrypto in the trusted `extensions` schema.
-- The prior function declaration quoted the full schema list as one value,
-- so unqualified digest()/encode()/convert_to() could not resolve at runtime.
ALTER FUNCTION public.sync_deep_business_scan_to_knowledge()
  SET search_path TO pg_catalog, extensions;

COMMENT ON FUNCTION public.sync_deep_business_scan_to_knowledge() IS
  'Normalizes security-approved deep website crawl pages and structured facts. Runtime search_path is pinned to pg_catalog + extensions for pgcrypto.';
