ALTER TABLE public.media_usage_daily
ADD COLUMN IF NOT EXISTS video_seconds_used integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS video_seconds_limit integer NOT NULL DEFAULT 0;

ALTER TABLE public.pricing_settings
ADD COLUMN IF NOT EXISTS daily_video_seconds_limit integer;

UPDATE public.pricing_settings
SET daily_video_seconds_limit = COALESCE(daily_video_seconds_limit, CASE
  WHEN is_donation = true THEN 0
  WHEN plan_key = 'standard' THEN 30
  WHEN plan_key = 'professional' THEN 60
  WHEN plan_key = 'advanced' THEN 180
  WHEN plan_key = 'enterprise' THEN -1
  ELSE 0
END);

ALTER TABLE public.pricing_settings
ALTER COLUMN daily_video_seconds_limit SET DEFAULT 0;

UPDATE public.pricing_settings
SET daily_video_seconds_limit = 0
WHERE daily_video_seconds_limit IS NULL;

ALTER TABLE public.pricing_settings
ALTER COLUMN daily_video_seconds_limit SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_media_daily_usage(
  _user_id uuid,
  _workspace_id uuid,
  _image_limit integer,
  _video_limit integer,
  _video_seconds_limit integer DEFAULT 0
)
RETURNS public.media_usage_daily
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.media_usage_daily;
BEGIN
  SELECT * INTO _row
  FROM public.media_usage_daily
  WHERE user_id = _user_id
  LIMIT 1;

  IF _row IS NULL THEN
    INSERT INTO public.media_usage_daily (
      user_id,
      workspace_id,
      usage_date,
      reset_at,
      window_started_at,
      window_ends_at,
      image_count,
      video_count,
      video_seconds_used,
      image_limit,
      video_limit,
      video_seconds_limit
    ) VALUES (
      _user_id,
      _workspace_id,
      CURRENT_DATE,
      now(),
      now(),
      now() + interval '24 hours',
      0,
      0,
      0,
      _image_limit,
      _video_limit,
      _video_seconds_limit
    ) RETURNING * INTO _row;

    RETURN _row;
  END IF;

  IF _row.window_ends_at <= now() THEN
    UPDATE public.media_usage_daily
    SET workspace_id = _workspace_id,
        usage_date = CURRENT_DATE,
        reset_at = now(),
        window_started_at = now(),
        window_ends_at = now() + interval '24 hours',
        image_count = 0,
        video_count = 0,
        video_seconds_used = 0,
        image_limit = _image_limit,
        video_limit = _video_limit,
        video_seconds_limit = _video_seconds_limit,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    UPDATE public.media_usage_daily
    SET workspace_id = _workspace_id,
        image_limit = _image_limit,
        video_limit = _video_limit,
        video_seconds_limit = _video_seconds_limit,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_media_quota(
  _user_id uuid,
  _workspace_id uuid,
  _media_type text,
  _image_limit integer,
  _video_limit integer,
  _video_seconds_limit integer DEFAULT 0,
  _requested_video_seconds integer DEFAULT NULL
)
RETURNS public.media_usage_daily
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.media_usage_daily;
  _video_seconds_to_consume integer := GREATEST(COALESCE(_requested_video_seconds, 0), 0);
BEGIN
  _row := public.ensure_media_daily_usage(_user_id, _workspace_id, _image_limit, _video_limit, _video_seconds_limit);

  IF _media_type = 'image' THEN
    IF _row.image_limit <> -1 AND _row.image_count >= _row.image_limit THEN
      RAISE EXCEPTION 'MEDIA_IMAGE_DAILY_LIMIT_REACHED';
    END IF;

    UPDATE public.media_usage_daily
    SET image_count = image_count + 1,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSIF _media_type = 'video' THEN
    IF _row.video_limit <> -1 AND _row.video_count >= _row.video_limit THEN
      RAISE EXCEPTION 'MEDIA_VIDEO_DAILY_LIMIT_REACHED';
    END IF;

    IF _row.video_seconds_limit <> -1 AND (_row.video_seconds_used + _video_seconds_to_consume) > _row.video_seconds_limit THEN
      RAISE EXCEPTION 'MEDIA_VIDEO_DAILY_DURATION_LIMIT_REACHED';
    END IF;

    UPDATE public.media_usage_daily
    SET video_count = video_count + 1,
        video_seconds_used = video_seconds_used + _video_seconds_to_consume,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    RAISE EXCEPTION 'INVALID_MEDIA_TYPE';
  END IF;

  RETURN _row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_expired_media_daily_usage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.media_usage_daily
  SET usage_date = CURRENT_DATE,
      reset_at = now(),
      window_started_at = now(),
      window_ends_at = now() + interval '24 hours',
      image_count = 0,
      video_count = 0,
      video_seconds_used = 0,
      updated_at = now()
  WHERE window_ends_at <= now();

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_media_usage_policy_for_user(uuid);

CREATE FUNCTION public.get_media_usage_policy_for_user(_user_id uuid)
RETURNS TABLE(
  plan_key text,
  daily_image_limit integer,
  daily_video_limit integer,
  daily_video_seconds_limit integer,
  max_video_seconds integer,
  allow_image_generation boolean,
  allow_video_generation boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ps.plan_key,
    ps.daily_image_limit,
    ps.daily_video_limit,
    ps.daily_video_seconds_limit,
    ps.max_video_seconds,
    COALESCE((ps.feature_entitlements->>'mediaGeneration')::boolean, false) AS allow_image_generation,
    COALESCE((ps.feature_entitlements->>'mediaGeneration')::boolean, false) AS allow_video_generation
  FROM public.subscriptions s
  JOIN public.pricing_settings ps
    ON ps.plan_key = COALESCE(NULLIF(s.plan, 'free'), 'standard')
    AND ps.is_donation = false
  WHERE s.user_id = _user_id
  LIMIT 1;
$function$;