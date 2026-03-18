-- Media Studio production-ready architecture

-- 1) Extend media_generations with queue, provider, lifecycle, and diagnostics metadata
ALTER TABLE public.media_generations
  ADD COLUMN IF NOT EXISTS provider_key text,
  ADD COLUMN IF NOT EXISTS provider_job_id text,
  ADD COLUMN IF NOT EXISTS request_source text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS job_id uuid,
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_media_generations_user_created_at
  ON public.media_generations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_generations_workspace_status
  ON public.media_generations (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_generations_provider_job_id
  ON public.media_generations (provider_job_id)
  WHERE provider_job_id IS NOT NULL;

-- 2) Provider settings table for future real providers and admin-managed limits
CREATE TABLE IF NOT EXISTS public.media_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  media_types text[] NOT NULL DEFAULT ARRAY['image','video'],
  is_enabled boolean NOT NULL DEFAULT false,
  is_mock boolean NOT NULL DEFAULT false,
  api_secret_name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.media_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view media provider settings"
ON public.media_provider_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert media provider settings"
ON public.media_provider_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update media provider settings"
ON public.media_provider_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete media provider settings"
ON public.media_provider_settings
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_media_provider_settings_updated_at
BEFORE UPDATE ON public.media_provider_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Usage policy table so admin can change limits without code changes
CREATE TABLE IF NOT EXISTS public.media_usage_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_key text NOT NULL UNIQUE,
  daily_image_limit integer NOT NULL DEFAULT 5,
  daily_video_limit integer NOT NULL DEFAULT 3,
  max_video_seconds integer NOT NULL DEFAULT 10,
  allow_image_generation boolean NOT NULL DEFAULT true,
  allow_video_generation boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.media_usage_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read media usage policy"
ON public.media_usage_policy
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert media usage policy"
ON public.media_usage_policy
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update media usage policy"
ON public.media_usage_policy
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete media usage policy"
ON public.media_usage_policy
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_media_usage_policy_updated_at
BEFORE UPDATE ON public.media_usage_policy
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Per-user daily counters with rolling 24h resets
CREATE TABLE IF NOT EXISTS public.media_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id uuid,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  reset_at timestamp with time zone NOT NULL DEFAULT now(),
  image_count integer NOT NULL DEFAULT 0,
  video_count integer NOT NULL DEFAULT 0,
  image_limit integer NOT NULL DEFAULT 5,
  video_limit integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

ALTER TABLE public.media_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media daily usage"
ON public.media_usage_daily
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media daily usage"
ON public.media_usage_daily
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media daily usage"
ON public.media_usage_daily
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all media daily usage"
ON public.media_usage_daily
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all media daily usage"
ON public.media_usage_daily
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_media_usage_daily_user_date
  ON public.media_usage_daily (user_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_media_usage_daily_workspace_date
  ON public.media_usage_daily (workspace_id, usage_date DESC);

CREATE TRIGGER update_media_usage_daily_updated_at
BEFORE UPDATE ON public.media_usage_daily
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Permanent usage event history for analytics and monetization
CREATE TABLE IF NOT EXISTS public.media_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid,
  user_id uuid NOT NULL,
  workspace_id uuid,
  media_type text NOT NULL,
  event_type text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  provider_key text,
  status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.media_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media usage events"
ON public.media_usage_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media usage events"
ON public.media_usage_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all media usage events"
ON public.media_usage_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_media_usage_events_user_created_at
  ON public.media_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_usage_events_workspace_created_at
  ON public.media_usage_events (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_usage_events_generation_id
  ON public.media_usage_events (generation_id)
  WHERE generation_id IS NOT NULL;

-- 6) Permanent error log for observability
CREATE TABLE IF NOT EXISTS public.media_generation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid,
  job_id uuid,
  user_id uuid,
  workspace_id uuid,
  provider_key text,
  media_type text,
  error_stage text NOT NULL,
  error_message text NOT NULL,
  error_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.media_generation_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media generation errors"
ON public.media_generation_errors
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media generation errors"
ON public.media_generation_errors
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all media generation errors"
ON public.media_generation_errors
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_media_generation_errors_user_created_at
  ON public.media_generation_errors (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_generation_errors_generation_id
  ON public.media_generation_errors (generation_id)
  WHERE generation_id IS NOT NULL;

-- 7) Add media daily counters to pricing_settings for future admin monetization controls
ALTER TABLE public.pricing_settings
  ADD COLUMN IF NOT EXISTS daily_image_limit integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS daily_video_limit integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_video_seconds integer NOT NULL DEFAULT 10;

-- 8) Seed default policy rows for current plans (safe upsert)
INSERT INTO public.media_usage_policy (plan_key, daily_image_limit, daily_video_limit, max_video_seconds, allow_image_generation, allow_video_generation)
VALUES
  ('standard', 5, 3, 10, true, true),
  ('professional', 25, 10, 20, true, true),
  ('advanced', 100, 30, 60, true, true),
  ('enterprise', 1000, 300, 120, true, true)
ON CONFLICT (plan_key) DO UPDATE SET
  daily_image_limit = EXCLUDED.daily_image_limit,
  daily_video_limit = EXCLUDED.daily_video_limit,
  max_video_seconds = EXCLUDED.max_video_seconds,
  allow_image_generation = EXCLUDED.allow_image_generation,
  allow_video_generation = EXCLUDED.allow_video_generation,
  updated_at = now();

INSERT INTO public.media_provider_settings (provider_key, provider_name, media_types, is_enabled, is_mock, api_secret_name, config, priority)
VALUES
  ('mock-video', 'Mock Video Provider', ARRAY['video'], true, true, null, jsonb_build_object('minDelayMs', 8000, 'maxDelayMs', 18000, 'failureRate', 0.12), 1),
  ('lovable-image', 'Lovable Image Provider', ARRAY['image'], true, false, 'LOVABLE_API_KEY', jsonb_build_object('model', 'google/gemini-3.1-flash-image-preview'), 1)
ON CONFLICT (provider_key) DO UPDATE SET
  provider_name = EXCLUDED.provider_name,
  media_types = EXCLUDED.media_types,
  is_enabled = EXCLUDED.is_enabled,
  is_mock = EXCLUDED.is_mock,
  api_secret_name = EXCLUDED.api_secret_name,
  config = EXCLUDED.config,
  priority = EXCLUDED.priority,
  updated_at = now();

-- 9) Helper: get active daily media limits for a user
CREATE OR REPLACE FUNCTION public.get_media_usage_policy_for_user(_user_id uuid)
RETURNS TABLE (
  plan_key text,
  daily_image_limit integer,
  daily_video_limit integer,
  max_video_seconds integer,
  allow_image_generation boolean,
  allow_video_generation boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(s.plan, 'free'), 'standard') AS plan_key,
    mup.daily_image_limit,
    mup.daily_video_limit,
    mup.max_video_seconds,
    mup.allow_image_generation,
    mup.allow_video_generation
  FROM public.subscriptions s
  LEFT JOIN public.media_usage_policy mup
    ON mup.plan_key = COALESCE(NULLIF(s.plan, 'free'), 'standard')
  WHERE s.user_id = _user_id
  LIMIT 1
$$;

-- 10) Helper: reset stale daily row and upsert current snapshot
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
  INSERT INTO public.media_usage_daily (
    user_id,
    workspace_id,
    usage_date,
    reset_at,
    image_count,
    video_count,
    image_limit,
    video_limit
  ) VALUES (
    _user_id,
    _workspace_id,
    CURRENT_DATE,
    now(),
    0,
    0,
    _image_limit,
    _video_limit
  )
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    image_limit = EXCLUDED.image_limit,
    video_limit = EXCLUDED.video_limit,
    updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- 11) Helper: consume quota atomically and return updated row
CREATE OR REPLACE FUNCTION public.consume_media_quota(
  _user_id uuid,
  _workspace_id uuid,
  _media_type text,
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
  _row := public.ensure_media_daily_usage(_user_id, _workspace_id, _image_limit, _video_limit);

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

    UPDATE public.media_usage_daily
    SET video_count = video_count + 1,
        updated_at = now()
    WHERE id = _row.id
    RETURNING * INTO _row;
  ELSE
    RAISE EXCEPTION 'INVALID_MEDIA_TYPE';
  END IF;

  RETURN _row;
END;
$$;