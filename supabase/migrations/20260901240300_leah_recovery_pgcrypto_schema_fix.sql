-- MR8E runtime correction: recovery hash functions must resolve pgcrypto from the
-- extensions schema used by Supabase. The original functions intentionally pin their
-- search_path; extend that pinned path rather than relying on caller/session search_path.

alter function public.leah_create_recovery_checkpoint_for_actor(uuid, uuid, uuid)
  set search_path = public, extensions, pg_temp;

alter function public.leah_verify_recovery_checkpoint_core(uuid, uuid)
  set search_path = public, extensions, pg_temp;
