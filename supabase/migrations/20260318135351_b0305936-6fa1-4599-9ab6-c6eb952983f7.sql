
-- Rewrite get_media_usage_policy_for_user to read from pricing_settings instead of media_usage_policy
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
SET search_path TO 'public'
AS $$
  SELECT
    ps.plan_key,
    ps.daily_image_limit,
    ps.daily_video_limit,
    ps.max_video_seconds,
    COALESCE((ps.feature_entitlements->>'mediaGeneration')::boolean, false) AS allow_image_generation,
    COALESCE((ps.feature_entitlements->>'mediaGeneration')::boolean, false) AS allow_video_generation
  FROM public.subscriptions s
  JOIN public.pricing_settings ps
    ON ps.plan_key = COALESCE(NULLIF(s.plan, 'free'), 'standard')
    AND ps.is_donation = false
  WHERE s.user_id = _user_id
  LIMIT 1
$$;

-- Drop the legacy media_usage_policy table (no longer referenced)
DROP TABLE IF EXISTS public.media_usage_policy;
