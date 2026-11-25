
-- Query Kimi /v1/models to confirm available models and correct default
SELECT net.http_get(
  url     := 'https://api.moonshot.ai/v1/models',
  params  := '{}'::jsonb,
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (SELECT value FROM public.internal_config WHERE key = 'kimi_api_key' LIMIT 1)
  )
) AS models_request_id;
;
