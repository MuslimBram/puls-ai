-- supabase/migrations/20260816030000_lidhjet_rpc_hardening.sql
-- ============================================================
-- PULSE AI — PACKAGE P4: LIDHJET RPC HARDENING & CONCURRENCY SAFETY
--
-- Adds SET search_path = public to SECURITY DEFINER functions,
-- handles ON CONFLICT / unique_violation for p_request_id gracefully,
-- and restricts EXECUTE permissions.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_community_ai_request(
  p_user_id uuid,
  p_module text,
  p_daily_limit integer,
  p_request_id text DEFAULT NULL,
  p_via text DEFAULT 'system',
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    INSERT INTO public.community_ai_daily_counters (user_id, module, usage_date, count)
    VALUES (p_user_id, p_module, (CURRENT_DATE AT TIME ZONE 'UTC'), 0)
    ON CONFLICT (user_id, module, usage_date) DO NOTHING;

    -- Lock counter row FOR UPDATE
    SELECT * INTO v_counter
    FROM public.community_ai_daily_counters
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC')
    FOR UPDATE;

    IF v_counter.count >= p_daily_limit THEN
      RETURN jsonb_build_object('status', 'capped', 'code', 'daily_limit_exceeded', 'allowed', false);
    END IF;

    -- Increment daily counter
    UPDATE public.community_ai_daily_counters
    SET count = count + 1,
        updated_at = clock_timestamp()
    WHERE user_id = p_user_id AND module = p_module AND usage_date = (CURRENT_DATE AT TIME ZONE 'UTC');
  END IF;

  -- Insert usage reservation with exception handling for concurrent requests
  BEGIN
    INSERT INTO public.community_ai_usage (
      user_id, workspace_id, module, status, request_id
    ) VALUES (
      p_user_id, p_workspace_id, p_module, 'reserved', p_request_id
    )
    RETURNING id INTO v_usage_id;
  EXCEPTION WHEN unique_violation THEN
    -- Return clean 409/reused response on parallel conflict, NEVER 500 error
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
$$;

-- Grant EXECUTE to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.claim_community_ai_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_community_ai_request TO authenticated, service_role;
