BEGIN;

DO $guard$
DECLARE
  _count integer;
  _identity text;
BEGIN
  SELECT count(*) INTO _count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'consume_media_quota';
  IF _count <> 2 THEN
    RAISE EXCEPTION 'R1A precondition failed: expected 2 consume_media_quota overloads, found %', _count;
  END IF;

  SELECT count(*) INTO _count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'ensure_media_daily_usage';
  IF _count <> 2 THEN
    RAISE EXCEPTION 'R1A precondition failed: expected 2 ensure_media_daily_usage overloads, found %', _count;
  END IF;

  SELECT count(*) INTO _count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'increment_usage_count',
    'boost_memory_confidence',
    'assign_thread_round_robin'
  );
  IF _count <> 3 THEN
    RAISE EXCEPTION 'R1A precondition failed: expected exactly 3 single-signature write RPCs, found %', _count;
  END IF;

  FOREACH _identity IN ARRAY ARRAY[
    'public.consume_media_quota(uuid,uuid,text,integer,integer)',
    'public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)',
    'public.ensure_media_daily_usage(uuid,uuid,integer,integer)',
    'public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)',
    'public.increment_usage_count(uuid)',
    'public.boost_memory_confidence(uuid,text,numeric)',
    'public.assign_thread_round_robin(uuid,uuid)'
  ] LOOP
    IF to_regprocedure(_identity) IS NULL THEN
      RAISE EXCEPTION 'R1A precondition failed: missing function identity %', _identity;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      WHERE p.oid = to_regprocedure(_identity)
        AND p.prosecdef
        AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    ) THEN
      RAISE EXCEPTION 'R1A precondition failed: % is not the expected SECURITY DEFINER plpgsql function', _identity;
    END IF;
  END LOOP;
END
$guard$;

-- ---------------------------------------------------------------------------
-- Backend-only media quota helpers.
--
-- Canonical source tracing found no browser or Edge runtime caller for these
-- four identities. They accept caller-supplied user/workspace/limit values, so
-- authenticated Data API execution is unnecessary and unsafe. Keep signatures
-- intact for trusted backend compatibility while removing browser execution.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer)
  SET search_path TO pg_catalog, public;
ALTER FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)
  SET search_path TO pg_catalog, public;
ALTER FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer)
  SET search_path TO pg_catalog, public;
ALTER FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)
  SET search_path TO pg_catalog, public;

REVOKE ALL ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_media_quota(uuid,uuid,text,integer,integer,integer,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_media_daily_usage(uuid,uuid,integer,integer,integer)
  TO service_role;

-- No canonical runtime caller exists for boost_memory_confidence either.
-- Its caller-supplied business id + boost can otherwise poison another tenant's
-- AI memory, so keep the existing signature but make it backend-only.
ALTER FUNCTION public.boost_memory_confidence(uuid,text,numeric)
  SET search_path TO pg_catalog, public;
REVOKE ALL ON FUNCTION public.boost_memory_confidence(uuid,text,numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boost_memory_confidence(uuid,text,numeric)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Browser-callable script usage counter.
-- Derive tenant identity from the script row; the caller never chooses it.
-- Match the existing call_scripts member visibility/use boundary.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_usage_count(_script_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  _workspace_id uuid;
BEGIN
  SELECT cs.workspace_id
  INTO _workspace_id
  FROM public.call_scripts cs
  WHERE cs.id = _script_id;

  IF NOT FOUND OR _workspace_id IS NULL THEN
    RAISE EXCEPTION 'CALL_SCRIPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_role(_workspace_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'FORBIDDEN: call script workspace access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.call_scripts
  SET usage_count = COALESCE(usage_count, 0) + 1,
      last_used_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = _script_id
    AND workspace_id = _workspace_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_usage_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_usage_count(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Browser-callable conversation assignment.
-- Bind the thread to the supplied workspace before reading/updating any routing
-- state, require the same owner/admin/member boundary used by thread UPDATE,
-- and keep load calculations tenant-scoped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_thread_round_robin(_workspace_id uuid, _thread_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $function$
DECLARE
  _rule record;
  _agents uuid[];
  _agent_id uuid;
  _next_idx integer;
  _open_count integer;
  _thread_workspace_id uuid;
BEGIN
  SELECT ct.workspace_id
  INTO _thread_workspace_id
  FROM public.conversation_threads ct
  WHERE ct.id = _thread_id;

  IF NOT FOUND OR _thread_workspace_id IS NULL THEN
    RAISE EXCEPTION 'THREAD_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF _thread_workspace_id <> _workspace_id THEN
    RAISE EXCEPTION 'THREAD_WORKSPACE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_workspace_role(_workspace_id, ARRAY['owner','admin','member']) THEN
    RAISE EXCEPTION 'FORBIDDEN: conversation workspace access required' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO _rule
  FROM public.assignment_rules ar
  WHERE ar.workspace_id = _workspace_id;

  IF _rule IS NULL OR _rule.strategy = 'manual' THEN
    RETURN NULL;
  END IF;

  SELECT ARRAY_AGG(tp.user_id ORDER BY tp.user_id)
  INTO _agents
  FROM public.team_presence tp
  WHERE tp.workspace_id = _workspace_id
    AND tp.status IN ('online', 'idle');

  IF _agents IS NULL OR array_length(_agents, 1) = 0 THEN
    IF _rule.fallback_user_id IS NOT NULL THEN
      UPDATE public.conversation_threads
      SET assigned_to = _rule.fallback_user_id::text
      WHERE id = _thread_id
        AND workspace_id = _workspace_id;
      RETURN _rule.fallback_user_id;
    END IF;
    RETURN NULL;
  END IF;

  IF _rule.strategy = 'round_robin' THEN
    _next_idx := (_rule.last_assigned_index % array_length(_agents, 1)) + 1;
    _agent_id := _agents[_next_idx];

    UPDATE public.assignment_rules
    SET last_assigned_index = _next_idx,
        updated_at = pg_catalog.now()
    WHERE id = _rule.id
      AND workspace_id = _workspace_id;

  ELSIF _rule.strategy = 'load_based' THEN
    SELECT tp.user_id
    INTO _agent_id
    FROM public.team_presence tp
    WHERE tp.workspace_id = _workspace_id
      AND tp.status IN ('online', 'idle')
    ORDER BY (
      SELECT COUNT(*)
      FROM public.conversation_threads ct
      WHERE ct.workspace_id = _workspace_id
        AND ct.assigned_to = tp.user_id::text
        AND ct.status IN ('new', 'open', 'pending')
    ) ASC
    LIMIT 1;
  END IF;

  IF _agent_id IS NOT NULL THEN
    SELECT COUNT(*)
    INTO _open_count
    FROM public.conversation_threads ct
    WHERE ct.workspace_id = _workspace_id
      AND ct.assigned_to = _agent_id::text
      AND ct.status IN ('new', 'open', 'pending');

    IF _open_count >= _rule.max_open_per_agent THEN
      IF _rule.fallback_user_id IS NOT NULL THEN
        _agent_id := _rule.fallback_user_id;
      ELSE
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  IF _agent_id IS NOT NULL THEN
    UPDATE public.conversation_threads
    SET assigned_to = _agent_id::text
    WHERE id = _thread_id
      AND workspace_id = _workspace_id;
  END IF;

  RETURN _agent_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_thread_round_robin(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_thread_round_robin(uuid,uuid) TO authenticated, service_role;

COMMIT;
