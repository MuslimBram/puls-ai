-- Migration: Fix claim_community_ai_request contract, via domain check, error_message column, and B7 RPC ACL hardening

-- 1. Restore legal via domain compatible with current deployed callers ('system', 'workspace')
ALTER TABLE public.community_ai_usage
DROP CONSTRAINT IF EXISTS community_ai_usage_via_check;

ALTER TABLE public.community_ai_usage
ADD CONSTRAINT community_ai_usage_via_check
CHECK (via IN ('system', 'workspace'));

-- 2. Add missing error_message column to community_ai_usage
ALTER TABLE public.community_ai_usage
ADD COLUMN IF NOT EXISTS error_message text;

-- 3. Update claim_community_ai_request RPC to write via column on reservation insert and match daily counter column used_count
CREATE OR REPLACE FUNCTION public.claim_community_ai_request(
  p_user_id uuid,
  p_module text,
  p_daily_limit integer,
  p_request_id text DEFAULT NULL::text,
  p_via text DEFAULT 'system'::text,
  p_workspace_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing public.community_ai_usage;
  v_counter public.community_ai_daily_counters;
  v_usage_id uuid;
BEGIN
  -- Idempotency check for request_id
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.community_ai_usage
    WHERE user_id = p_user_id AND module = p_module AND request_id = p_request_id;

    IF FOUND THEN
      IF v_existing.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'completed', 'allowed', false, 'reused', true, 'record_id', v_existing.id);
      ELSIF v_existing.status = 'failed' THEN
        RETURN jsonb_build_object('status', 'failed', 'allowed', false, 'reused', true, 'error', v_existing.error_message);
      ELSIF v_existing.status = 'reserved' THEN
        RETURN jsonb_build_object('status', 'in_progress', 'code', '409_in_progress', 'allowed', false, 'reused', true);
      END IF;
    END IF;
  END IF;

  -- Handle system path rate limiting (daily counter)
  IF p_via = 'system' THEN
    -- Upsert daily counter
    INSERT INTO public.community_ai_daily_counters (user_id, module, usage_date, used_count)
    VALUES (p_user_id, p_module, (CURRENT_DATE AT TIME ZONE 'UTC'), 0)
    ON CONFLICT (user_id, module, usage_date) DO NOTHING;

    -- Lock counter row FOR UPDATE
    SELECT * INTO v_counter
    FROM public.community_ai_daily_counters
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC')
    FOR UPDATE;

    IF v_counter.used_count >= p_daily_limit THEN
      RETURN jsonb_build_object('status', 'capped', 'code', 'daily_limit_exceeded', 'allowed', false);
    END IF;

    -- Increment daily counter
    UPDATE public.community_ai_daily_counters
    SET used_count = used_count + 1
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC');
  END IF;

  -- Insert usage reservation with exception handling for concurrent requests
  BEGIN
    INSERT INTO public.community_ai_usage (
      user_id, workspace_id, module, via, status, request_id
    ) VALUES (
      p_user_id, p_workspace_id, p_module, COALESCE(p_via, 'system'), 'reserved', p_request_id
    )
    RETURNING id INTO v_usage_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.community_ai_usage
    WHERE user_id = p_user_id AND module = p_module AND request_id = p_request_id;
    RETURN jsonb_build_object(
      'status', COALESCE(v_existing.status, 'in_progress'),
      'code', '409_in_progress',
      'allowed', false,
      'reused', true,
      'record_id', v_existing.id
    );
  END;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'allowed', true,
    'usage_id', v_usage_id
  );
END;
$function$;

-- 4. Enforce strict B7 RPC ACL controls (REVOKE from PUBLIC/anon/authenticated, GRANT to service_role)
REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request(uuid, text, integer, text, text, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_community_ai_request(uuid, text, integer, text, text, uuid)
TO service_role;

GRANT ALL ON public.community_ai_usage, public.community_ai_daily_counters TO service_role;
