-- R1B critical SECURITY DEFINER write-path closure.
-- Scope: check_rate_limit(text,uuid,text,integer,integer,integer)
--        compute_thread_sla(uuid,uuid)
-- Production precheck evidence (2026-08-29): rate_limit_buckets has 0 rows.

DO $$
DECLARE
  _count integer;
BEGIN
  SELECT count(*) INTO _count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid::regprocedure::text = 'check_rate_limit(text,uuid,text,integer,integer,integer)'
    AND p.prosecdef;
  IF _count <> 1 THEN
    RAISE EXCEPTION 'R1B drift: expected SECURITY DEFINER check_rate_limit(text,uuid,text,integer,integer,integer)';
  END IF;

  SELECT count(*) INTO _count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.oid::regprocedure::text = 'compute_thread_sla(uuid,uuid)'
    AND p.prosecdef;
  IF _count <> 1 THEN
    RAISE EXCEPTION 'R1B drift: expected SECURITY DEFINER compute_thread_sla(uuid,uuid)';
  END IF;

  IF to_regclass('public.rate_limit_buckets') IS NULL THEN
    RAISE EXCEPTION 'R1B drift: rate_limit_buckets missing';
  END IF;

  IF (SELECT count(*) FROM public.rate_limit_buckets) <> 0 THEN
    RAISE EXCEPTION 'R1B precondition failed: rate_limit_buckets is no longer empty; re-audit before constraint migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.rate_limit_buckets'::regclass
      AND conname = 'rate_limit_buckets_bucket_key_key'
      AND pg_get_constraintdef(oid) = 'UNIQUE (bucket_key)'
  ) THEN
    RAISE EXCEPTION 'R1B drift: expected legacy UNIQUE(bucket_key) constraint';
  END IF;
END $$;

-- A bucket key is tenant-scoped, not platform-global. NULLS NOT DISTINCT also
-- preserves deterministic uniqueness for any trusted global/null workspace use.
ALTER TABLE public.rate_limit_buckets
  DROP CONSTRAINT rate_limit_buckets_bucket_key_key;
ALTER TABLE public.rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_workspace_bucket_key_key
  UNIQUE NULLS NOT DISTINCT (workspace_id, bucket_key);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket_key text,
  _workspace_id uuid,
  _endpoint text DEFAULT NULL::text,
  _max_tokens integer DEFAULT 100,
  _refill_rate integer DEFAULT 10,
  _refill_sec integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  _bucket RECORD;
  _elapsed INT;
  _refilled INT;
  _new_tokens INT;
BEGIN
  IF _bucket_key IS NULL OR btrim(_bucket_key) = '' THEN
    RAISE EXCEPTION 'RATE_LIMIT_BUCKET_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _max_tokens <= 0 OR _refill_rate < 0 OR _refill_sec <= 0 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_CONFIGURATION' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rate_limit_buckets (
    bucket_key,
    workspace_id,
    endpoint,
    max_tokens,
    refill_rate,
    refill_interval_sec
  )
  VALUES (
    _bucket_key,
    _workspace_id,
    _endpoint,
    _max_tokens,
    _refill_rate,
    _refill_sec
  )
  ON CONFLICT ON CONSTRAINT rate_limit_buckets_workspace_bucket_key_key DO NOTHING;

  SELECT * INTO _bucket
  FROM public.rate_limit_buckets
  WHERE bucket_key = _bucket_key
    AND workspace_id IS NOT DISTINCT FROM _workspace_id
  FOR UPDATE;

  IF _bucket IS NULL THEN
    RAISE EXCEPTION 'RATE_LIMIT_BUCKET_RESOLUTION_FAILED';
  END IF;

  IF _bucket.suspended_until IS NOT NULL AND _bucket.suspended_until > now() THEN
    RETURN false;
  END IF;

  _elapsed := EXTRACT(EPOCH FROM (now() - _bucket.last_refill_at))::INT;
  _refilled := (_elapsed / GREATEST(_bucket.refill_interval_sec, 1)) * _bucket.refill_rate;
  _new_tokens := LEAST(_bucket.max_tokens, _bucket.tokens_remaining + _refilled);

  IF _new_tokens <= 0 THEN
    UPDATE public.rate_limit_buckets
    SET abuse_flag = true,
        abuse_reason = 'Sustained rate limit hits',
        updated_at = now()
    WHERE id = _bucket.id
      AND workspace_id IS NOT DISTINCT FROM _workspace_id
      AND NOT abuse_flag;
    RETURN false;
  END IF;

  UPDATE public.rate_limit_buckets
  SET tokens_remaining = _new_tokens - 1,
      last_refill_at = CASE WHEN _refilled > 0 THEN now() ELSE last_refill_at END,
      updated_at = now()
  WHERE id = _bucket.id
    AND workspace_id IS NOT DISTINCT FROM _workspace_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_thread_sla(
  _thread_id uuid,
  _workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  _sla RECORD;
  _thread RECORD;
BEGIN
  SELECT * INTO _thread
  FROM public.conversation_threads
  WHERE id = _thread_id;

  IF _thread IS NULL THEN
    RETURN;
  END IF;

  IF _thread.workspace_id IS DISTINCT FROM _workspace_id THEN
    RAISE EXCEPTION 'THREAD_WORKSPACE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _sla
  FROM public.sla_configs
  WHERE workspace_id = _thread.workspace_id;

  IF _sla IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.conversation_threads
  SET sla_response_due = CASE
        WHEN first_response_at IS NULL
          THEN _thread.created_at + (_sla.first_response_minutes || ' minutes')::interval
        ELSE sla_response_due
      END,
      next_response_due = _thread.last_message_at + (_sla.next_response_minutes || ' minutes')::interval,
      resolution_due = _thread.created_at + (_sla.resolution_minutes || ' minutes')::interval,
      sla_breached = CASE
        WHEN first_response_at IS NULL
          AND now() > _thread.created_at + (_sla.first_response_minutes || ' minutes')::interval
          THEN true
        WHEN now() > _thread.created_at + (_sla.resolution_minutes || ' minutes')::interval
          AND status NOT IN ('resolved', 'closed')
          THEN true
        ELSE sla_breached
      END
  WHERE id = _thread_id
    AND workspace_id = _workspace_id;
END;
$function$;

-- Both are infrastructure write primitives. Canonical source trace found no
-- browser/runtime caller; authenticated Data API execution is unnecessary.
REVOKE ALL ON FUNCTION public.check_rate_limit(text,uuid,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,uuid,text,integer,integer,integer) TO service_role;

REVOKE ALL ON FUNCTION public.compute_thread_sla(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_thread_sla(uuid,uuid) TO service_role;
