-- Make media daily quotas truly rolling 24h and resettable server-side
ALTER TABLE public.media_usage_daily
  ADD COLUMN IF NOT EXISTS window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS window_ends_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_usage_daily_user_id_usage_date_key'
      AND conrelid = 'public.media_usage_daily'::regclass
  ) THEN
    ALTER TABLE public.media_usage_daily DROP CONSTRAINT media_usage_daily_user_id_usage_date_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_usage_daily_user_unique
  ON public.media_usage_daily (user_id);

CREATE OR REPLACE FUNCTION public.ensure_media_daily_usage(
  _user_id uuid,
  _workspace_id uuid,
  _image_limit integer,
  _video_limit integer
)
RETURNS public.media_usage_daily
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      image_limit,
      video_limit
    ) VALUES (
      _user_id,
      _workspace_id,
      CURRENT_DATE,
      now(),
      now(),
      now() + interval '24 hours',
      0,
      0,
      _image_limit,
      _video_limit
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
        image_limit = _image_limit,
        video_limit = _video_limit,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    UPDATE public.media_usage_daily
    SET workspace_id = _workspace_id,
        image_limit = _image_limit,
        video_limit = _video_limit,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  END IF;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_expired_media_daily_usage()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      updated_at = now()
  WHERE window_ends_at <= now();

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END;
$$;