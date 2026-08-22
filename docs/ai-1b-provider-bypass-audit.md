# AI-1B Provider Bypass Consolidation Audit

## Scope
Server-side audit covered `/supabase/functions` generative AI call sites (direct provider HTTP endpoints, direct provider SDK usage, and hardcoded provider/model selection).

## Classification Summary

### CANONICAL_ROUTER_ALREADY
- `supabase/functions/ai-router/index.ts` (canonical provider routing/failover)
- `supabase/functions/_shared/ai-router-helper.ts`
- Callers already using `ai-router`: `ai-help-bot`, `voice-ai-relay`, `customer-brain`, `score-leads`, `score-visitors`, `telegram-webhook`, `community-assess-profile`, `community-scan-image`

### BYPASS_TO_CONSOLIDATE (migrated in AI-1B)
- `supabase/functions/_shared/ai-client.ts` (legacy direct Lovable/Anthropic path removed; now canonical `ai-router` only)
- `supabase/functions/agent-config-manager/index.ts`
- `supabase/functions/agent-orchestrator/index.ts`
- `supabase/functions/multi-agent-engine/index.ts`
- `supabase/functions/ai-setup-assistant/index.ts`
- `supabase/functions/public-lead-capture/index.ts`
- `supabase/functions/email-campaign-engine/index.ts`
- `supabase/functions/autonomous-ai-agent/index.ts`
- `supabase/functions/learning-engine/index.ts`
- `supabase/functions/sales-sequence-engine/index.ts`
- `supabase/functions/vicidial-cdr-sync/index.ts`
- `supabase/functions/check-device-trust/index.ts`
- `supabase/functions/security-monitor/index.ts`

### JUSTIFIED_DIRECT_PROVIDER
| path | provider | reason | customer-facing | workspace data | why ai-router is inappropriate |
|---|---|---|---|---|---|
| `supabase/functions/transcribe-recording/index.ts` | OpenAI audio transcription endpoint | Speech-to-text transport endpoint (`/v1/audio/transcriptions`) is non-chat modality | YES | YES | Canonical router currently routes chat/message generation, not binary audio transcription transport |
| `supabase/functions/transcribe-recording/index.ts` | Anthropic Messages | Post-transcription structured call intelligence analysis coupled to telephony transcript workflow | YES | YES | Specialized voice pipeline combines Twilio transcript + fallback transcription + analysis in one modality-specific flow |
| `supabase/functions/job-worker/index.ts` | Lovable AI Gateway image model | Image/media generation worker path (`google/gemini-3.1-flash-image-preview`) | NO | YES | Canonical router currently targets text/chat provider contracts, not image generation job orchestration |

### EMBEDDINGS_OR_SPECIALIZED_NON_ROUTER_PATH
- `supabase/functions/transcribe-recording/index.ts` (audio transcription and voice pipeline)
- `supabase/functions/job-worker/index.ts` (media generation worker)

### INTERNAL_CODING_AI
- `supabase/functions/builder-adapter-router/index.ts` (tool/builder adapter routing; not customer chat router)
- `supabase/functions/mcp/index.ts` (internal MCP runtime scaffolding)

### DEAD_OR_UNUSED (not wired from current app/runtime paths)
- `supabase/functions/ai-conversation-memory/index.ts`
- `supabase/functions/ai-registration-check/index.ts`
- `supabase/functions/ai-sales-assistant/index.ts`
- `supabase/functions/analyze-competitor/index.ts`
- `supabase/functions/analyze-lead/index.ts`
- `supabase/functions/business-insight-ai/index.ts`
- `supabase/functions/business-scan-extract/index.ts`
- `supabase/functions/dedicated-ai-reply/index.ts`
- `supabase/functions/email-poll/index.ts`
- `supabase/functions/extract-and-store-memory/index.ts`
- `supabase/functions/generate-ai-suggestions/index.ts`
- `supabase/functions/generate-business-content/index.ts`
- `supabase/functions/generate-campaign/index.ts`
- `supabase/functions/generate-content/index.ts`
- `supabase/functions/generate-reply/index.ts`
- `supabase/functions/ingest-document/index.ts`
- `supabase/functions/ingest-website/index.ts`
- `supabase/functions/scan-business-content/index.ts`
- `supabase/functions/scan-source-extract/index.ts`
- `supabase/functions/seo-audit/index.ts`
- `supabase/functions/unified-ai-agent/index.ts`
- `supabase/functions/withdrawal-fraud-check/index.ts`

## Notes
- AI-2 orchestrator/facade was not introduced.
- No second router or second provider registry was added.
