-- Migration: 20260817014600_job_queue_rls_hardening.sql
-- Security Hardening: Restrict job_queue management strictly to service_role / platform admin.
-- Prevents ordinary authenticated users from inserting/modifying jobs executed by background workers.
-- background_jobs is outside this migration's frozen target; no policies are modified to avoid destructive replay/order hazards.

DO $$
DECLARE
  pol RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'job_queue'
  ) THEN
    -- Dynamically drop all existing policies on public.job_queue
    FOR pol IN (
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'job_queue'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.job_queue', pol.policyname);
    END LOOP;

    -- Ensure RLS is enabled on job_queue
    EXECUTE 'ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY';

    -- Platform admin can view job_queue for monitoring/operations
    EXECUTE 'CREATE POLICY "Platform admins can view job_queue" ON public.job_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
END $$;
