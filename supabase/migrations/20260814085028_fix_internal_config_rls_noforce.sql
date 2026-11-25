
-- Explicitly remove the FORCE flag
-- FORCE = even postgres superuser subject to RLS → breaks SECURITY DEFINER function
-- NO FORCE = postgres superuser bypasses RLS → SECURITY DEFINER function can read
ALTER TABLE public.internal_config NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
;
