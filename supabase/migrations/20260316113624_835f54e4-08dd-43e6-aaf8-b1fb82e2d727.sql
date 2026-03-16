
-- Add controller and worker roles to enum (must be separate transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'controller';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'worker';
