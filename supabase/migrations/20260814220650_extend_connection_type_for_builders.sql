
-- Extend connection_type CHECK constraint to include builder adapter types.
-- Current: oauth, api_key, bot_token, webhook, credentials
-- Adding: mcp_oauth, mcp_oauth_pkce, agent_sdk

ALTER TABLE public.unified_connections
  DROP CONSTRAINT IF EXISTS unified_connections_connection_type_check;

ALTER TABLE public.unified_connections
  ADD CONSTRAINT unified_connections_connection_type_check
  CHECK (connection_type = ANY (ARRAY[
    'oauth'::text, 'api_key'::text, 'bot_token'::text,
    'webhook'::text, 'credentials'::text,
    'mcp_oauth'::text, 'mcp_oauth_pkce'::text, 'agent_sdk'::text
  ]));

-- Verify
SELECT pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'public.unified_connections'::regclass
  AND contype = 'c' AND conname LIKE '%connection_type%';
;
