// AI-4: Canonical Pulse AI Unified Memory Facade
//
// Purpose:
//   Provide one bounded, provenance-preserving, workspace-scoped READ path for
//   Pulse AI reasoning. Existing modules remain owners of writes.
//
// Security invariants:
//   - public callers receive no private memory;
//   - workspace scope must already be verified by the application layer;
//   - every private source query is scoped to the verified workspace;
//   - contact/conversation references are verified before scoped retrieval;
//   - service-role database access never removes workspace predicates;
//   - optional source failures never widen access or trigger a fail-open query.
//
// Architectural boundaries:
//   AI-2 = orchestration/reasoning
//   AI-3 = controlled approval/execution
//   AI-4 = memory/context
//   AI Router = provider/model selection

export const PULSE_MEMORY_TYPES = [
  "BUSINESS",
  "CUSTOMER",
  "CONVERSATION",
  "CRM",
  "KNOWLEDGE",
  "INTERACTION",
  "PREFERENCE",
] as const;

export type PulseMemoryType = (typeof PULSE_MEMORY_TYPES)[number];
export type MemoryFactualStatus = "FACT" | "OBSERVATION" | "AI_INFERENCE";
export type MemoryAuthType = "public_unauthenticated" | "user_jwt" | "internal_service";

export interface MemoryAuthContext {
  type: MemoryAuthType;
  /** True only after the application layer verified/accepted the workspace scope. */
  workspaceVerified: boolean;
  userId?: string;
}

export interface PulseMemoryRequest {
  workspaceId: string;
  authContext: MemoryAuthContext;
  userId?: string;
  contactId?: string;
  conversationId?: string;
  memoryTypes?: PulseMemoryType[];
  query?: string;
  limit?: number;
  correlationId?: string;
}

export interface PulseMemoryProvenance {
  source: string;
  sourceRecordId?: string;
  workspaceId: string;
  factualStatus: MemoryFactualStatus;
  sourceTimestamp?: string;
}

export interface PulseMemoryEntry {
  id: string;
  memoryType: PulseMemoryType;
  source: string;
  subject: string;
  content: string;
  relevance: number;
  factualStatus: MemoryFactualStatus;
  provenance: PulseMemoryProvenance;
  createdAt?: string;
  updatedAt?: string;
}

export type MemorySourceStatus = "OK" | "EMPTY" | "UNAVAILABLE" | "NOT_USED";

export interface PulseMemoryResponse {
  success: boolean;
  workspaceId: string;
  entries: PulseMemoryEntry[];
  denied?: boolean;
  errorCode?:
    | "PUBLIC_CONTEXT_PRIVATE_MEMORY_DENIED"
    | "WORKSPACE_SCOPE_NOT_VERIFIED"
    | "REFERENCE_SCOPE_MISMATCH";
  warnings: string[];
  sourceStatus: Record<string, MemorySourceStatus>;
}

interface SourceResult<T> {
  ok: boolean;
  rows: T[];
  error?: string;
}

interface ReferenceResult {
  ok: boolean;
  scoped: boolean;
  resolvedIdentifier?: string;
  error?: string;
}

interface BusinessProfileRow {
  id: string;
  business_name?: string | null;
  short_description?: string | null;
  industry?: string | null;
  target_audience?: string | null;
  mission_values?: string | null;
  main_services?: string | null;
  ai_tone?: string | null;
  language?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ConversationMemoryRow {
  id: string;
  contact_identifier: string;
  contact_name?: string | null;
  memory_type?: string | null;
  summary?: string | null;
  key_facts?: unknown;
  sentiment_trend?: string | null;
  last_interaction_at?: string | null;
  interaction_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface ConversationThreadRow {
  id: string;
  subject?: string | null;
  status?: string | null;
  priority?: string | null;
  channel_type?: string | null;
  contact_name?: string | null;
  contact_identifier?: string | null;
  ai_summary?: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  message_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface EnrichedContactRow {
  id: string;
  contact_identifier: string;
  contact_name?: string | null;
  channel_types?: string[] | null;
  total_messages?: number | null;
  total_leads?: number | null;
  total_deals?: number | null;
  total_deal_value?: number | null;
  avg_intent_score?: number | null;
  last_seen_at?: string | null;
  last_channel?: string | null;
  tags?: string[] | null;
  sentiment_summary?: string | null;
  ai_profile_summary?: string | null;
  is_opted_out?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface KnowledgeChunkRow {
  id: string;
  source_id: string;
  content: string;
  summary?: string | null;
  topic_tags?: string[] | null;
  content_type?: string | null;
  page_url?: string | null;
  page_title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface InterestMemoryRow {
  id: string;
  interest_type: string;
  interest_ref: string;
  evidence_count?: number | null;
  strength?: number | null;
  source_provider?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  state?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PulseMemoryAdapter {
  verifyContact(workspaceId: string, contactId: string): Promise<ReferenceResult>;
  verifyConversation(workspaceId: string, conversationId: string): Promise<ReferenceResult>;
  fetchBusinessProfiles(workspaceId: string, limit: number): Promise<SourceResult<BusinessProfileRow>>;
  fetchConversationMemory(
    workspaceId: string,
    resolvedContactIdentifier: string | undefined,
    limit: number,
  ): Promise<SourceResult<ConversationMemoryRow>>;
  fetchConversationThread(
    workspaceId: string,
    conversationId: string,
  ): Promise<SourceResult<ConversationThreadRow>>;
  fetchEnrichedContact(
    workspaceId: string,
    resolvedContactIdentifier: string,
  ): Promise<SourceResult<EnrichedContactRow>>;
  fetchKnowledge(workspaceId: string, limit: number): Promise<SourceResult<KnowledgeChunkRow>>;
  fetchInterestMemory(workspaceId: string, limit: number): Promise<SourceResult<InterestMemoryRow>>;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;
const SOURCE_LIMIT = 20;
const MAX_ENTRY_CHARS = 900;
const MAX_CONTEXT_CHARS = 5_500;

export function normalizeMemoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit!)));
}

export function isPublicMemoryContext(auth: MemoryAuthContext): boolean {
  return auth.type === "public_unauthenticated";
}

export function createPublicMemoryDenied(workspaceId = ""): PulseMemoryResponse {
  return {
    success: false,
    workspaceId,
    entries: [],
    denied: true,
    errorCode: "PUBLIC_CONTEXT_PRIVATE_MEMORY_DENIED",
    warnings: ["Public Pulse AI cannot access workspace-private memory."],
    sourceStatus: {},
  };
}

export function classifyFactualStatus(source: string, value?: unknown): MemoryFactualStatus {
  const normalized = source.toLowerCase();
  if (
    normalized.includes("ai_summary") ||
    normalized.includes("ai_profile") ||
    normalized.includes("key_facts") ||
    normalized.includes("ai_conversation_memory")
  ) {
    return "AI_INFERENCE";
  }
  if (
    normalized.includes("interest") ||
    normalized.includes("sentiment") ||
    normalized.includes("enriched_contacts")
  ) {
    return "OBSERVATION";
  }
  if (typeof value === "object" && value !== null && "inferred" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).inferred === true ? "AI_INFERENCE" : "FACT";
  }
  return "FACT";
}

export function sanitizeMemoryText(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "[REDACTED_BEARER]")
    .replace(/\b(?:sk|sbp)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_SECRET]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ENTRY_CHARS);
}

function tokenize(value: string | undefined): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .toLowerCase()
      .normalize("NFKD")
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .slice(0, 30),
  )];
}

export function computeMemoryRelevance(content: string, query?: string, updatedAt?: string): number {
  const terms = tokenize(query);
  const lower = content.toLowerCase();
  let score = terms.length === 0 ? 0.45 : 0.15;
  if (terms.length > 0) {
    const matched = terms.filter((term) => lower.includes(term)).length;
    score += 0.65 * (matched / terms.length);
  }
  if (updatedAt) {
    const ageMs = Date.now() - new Date(updatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0) {
      const days = ageMs / 86_400_000;
      if (days <= 7) score += 0.12;
      else if (days <= 30) score += 0.07;
      else if (days <= 90) score += 0.03;
    }
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

export function dedupeAndRankMemory(
  entries: PulseMemoryEntry[],
  query: string | undefined,
  limit: number,
): PulseMemoryEntry[] {
  const deduped = new Map<string, PulseMemoryEntry>();
  for (const entry of entries) {
    const content = sanitizeMemoryText(entry.content);
    if (!content) continue;
    const normalized: PulseMemoryEntry = {
      ...entry,
      content,
      relevance: computeMemoryRelevance(content, query, entry.updatedAt ?? entry.createdAt),
    };
    const key = `${normalized.memoryType}|${normalized.source}|${normalized.provenance.sourceRecordId ?? ""}|${content.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || normalized.relevance > existing.relevance) deduped.set(key, normalized);
  }
  return [...deduped.values()]
    .sort((a, b) => b.relevance - a.relevance || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
    .slice(0, normalizeMemoryLimit(limit));
}

function wants(req: PulseMemoryRequest, type: PulseMemoryType): boolean {
  return !req.memoryTypes || req.memoryTypes.length === 0 || req.memoryTypes.includes(type);
}

function makeEntry(args: {
  workspaceId: string;
  type: PulseMemoryType;
  source: string;
  recordId?: string;
  subject: string;
  content: unknown;
  factualStatus?: MemoryFactualStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}): PulseMemoryEntry {
  const factualStatus = args.factualStatus ?? classifyFactualStatus(args.source, args.content);
  const createdAt = args.createdAt ?? undefined;
  const updatedAt = args.updatedAt ?? undefined;
  return {
    id: `${args.source}:${args.recordId ?? crypto.randomUUID()}:${args.type}`,
    memoryType: args.type,
    source: args.source,
    subject: sanitizeMemoryText(args.subject),
    content: sanitizeMemoryText(args.content),
    relevance: 0,
    factualStatus,
    provenance: {
      source: args.source,
      sourceRecordId: args.recordId,
      workspaceId: args.workspaceId,
      factualStatus,
      sourceTimestamp: updatedAt ?? createdAt,
    },
    createdAt,
    updatedAt,
  };
}

function pushSourceWarning(
  warnings: string[],
  sourceStatus: Record<string, MemorySourceStatus>,
  source: string,
  result: SourceResult<unknown>,
): void {
  if (result.ok) {
    sourceStatus[source] = result.rows.length > 0 ? "OK" : "EMPTY";
    return;
  }
  sourceStatus[source] = "UNAVAILABLE";
  warnings.push(`${source} unavailable; memory retrieval continued without widening scope.`);
}

export async function retrieveUnifiedMemory(
  adapter: PulseMemoryAdapter,
  req: PulseMemoryRequest,
): Promise<PulseMemoryResponse> {
  if (isPublicMemoryContext(req.authContext)) return createPublicMemoryDenied("");

  if (!req.workspaceId || !req.authContext.workspaceVerified) {
    return {
      success: false,
      workspaceId: req.workspaceId,
      entries: [],
      denied: true,
      errorCode: "WORKSPACE_SCOPE_NOT_VERIFIED",
      warnings: ["Private memory requires a verified workspace scope."],
      sourceStatus: {},
    };
  }

  const limit = normalizeMemoryLimit(req.limit);
  const warnings: string[] = [];
  const sourceStatus: Record<string, MemorySourceStatus> = {};
  let resolvedContactIdentifier: string | undefined;

  if (req.contactId) {
    const contact = await adapter.verifyContact(req.workspaceId, req.contactId);
    if (!contact.ok || !contact.scoped) {
      return {
        success: false,
        workspaceId: req.workspaceId,
        entries: [],
        denied: true,
        errorCode: "REFERENCE_SCOPE_MISMATCH",
        warnings: ["Contact reference could not be verified inside the workspace."],
        sourceStatus,
      };
    }
    resolvedContactIdentifier = contact.resolvedIdentifier ?? req.contactId;
  }

  if (req.conversationId) {
    const conversation = await adapter.verifyConversation(req.workspaceId, req.conversationId);
    if (!conversation.ok || !conversation.scoped) {
      return {
        success: false,
        workspaceId: req.workspaceId,
        entries: [],
        denied: true,
        errorCode: "REFERENCE_SCOPE_MISMATCH",
        warnings: ["Conversation reference could not be verified inside the workspace."],
        sourceStatus,
      };
    }
  }

  const entries: PulseMemoryEntry[] = [];
  const jobs: Array<Promise<void>> = [];

  if (wants(req, "BUSINESS")) {
    jobs.push((async () => {
      const result = await adapter.fetchBusinessProfiles(req.workspaceId, Math.min(SOURCE_LIMIT, limit));
      pushSourceWarning(warnings, sourceStatus, "business_profiles", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: "BUSINESS",
          source: "business_profiles",
          recordId: row.id,
          subject: row.business_name ?? "Business profile",
          factualStatus: "FACT",
          content: {
            business_name: row.business_name,
            description: row.short_description,
            industry: row.industry,
            target_audience: row.target_audience,
            mission_values: row.mission_values,
            main_services: row.main_services,
            ai_tone: row.ai_tone,
            language: row.language,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    })());
  } else sourceStatus.business_profiles = "NOT_USED";

  if (wants(req, "CONVERSATION") || wants(req, "CUSTOMER") || wants(req, "PREFERENCE")) {
    jobs.push((async () => {
      const result = await adapter.fetchConversationMemory(
        req.workspaceId,
        resolvedContactIdentifier,
        Math.min(SOURCE_LIMIT, Math.max(limit, 8)),
      );
      pushSourceWarning(warnings, sourceStatus, "ai_conversation_memory", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        const mappedType: PulseMemoryType = row.memory_type === "preference"
          ? "PREFERENCE"
          : row.memory_type === "profile" || row.memory_type === "deal_context"
          ? "CUSTOMER"
          : "CONVERSATION";
        if (!wants(req, mappedType)) continue;
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: mappedType,
          source: "ai_conversation_memory",
          recordId: row.id,
          subject: row.contact_name ?? row.contact_identifier,
          factualStatus: "AI_INFERENCE",
          content: {
            summary: row.summary,
            key_facts: row.key_facts,
            sentiment_trend: row.sentiment_trend,
            interaction_count: row.interaction_count,
            last_interaction_at: row.last_interaction_at,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? row.last_interaction_at,
        }));
      }
    })());
  } else sourceStatus.ai_conversation_memory = "NOT_USED";

  if (req.conversationId && wants(req, "CONVERSATION")) {
    jobs.push((async () => {
      const result = await adapter.fetchConversationThread(req.workspaceId, req.conversationId!);
      pushSourceWarning(warnings, sourceStatus, "conversation_threads", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: "CONVERSATION",
          source: "conversation_threads",
          recordId: row.id,
          subject: row.subject ?? row.contact_name ?? "Conversation",
          factualStatus: row.ai_summary ? "AI_INFERENCE" : "FACT",
          content: {
            status: row.status,
            priority: row.priority,
            channel: row.channel_type,
            last_message_preview: row.last_message_preview,
            ai_summary: row.ai_summary,
            message_count: row.message_count,
            last_message_at: row.last_message_at,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? row.last_message_at,
        }));
      }
    })());
  } else sourceStatus.conversation_threads = "NOT_USED";

  if (resolvedContactIdentifier && wants(req, "CRM")) {
    jobs.push((async () => {
      const result = await adapter.fetchEnrichedContact(req.workspaceId, resolvedContactIdentifier!);
      pushSourceWarning(warnings, sourceStatus, "enriched_contacts", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: "CRM",
          source: "enriched_contacts",
          recordId: row.id,
          subject: row.contact_name ?? row.contact_identifier,
          factualStatus: "OBSERVATION",
          content: {
            channels: row.channel_types,
            total_messages: row.total_messages,
            total_leads: row.total_leads,
            total_deals: row.total_deals,
            total_deal_value: row.total_deal_value,
            avg_intent_score: row.avg_intent_score,
            last_channel: row.last_channel,
            tags: row.tags,
            sentiment_summary: row.sentiment_summary,
            ai_profile_summary: row.ai_profile_summary,
            opted_out: row.is_opted_out,
            last_seen_at: row.last_seen_at,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? row.last_seen_at,
        }));
      }
    })());
  } else sourceStatus.enriched_contacts = "NOT_USED";

  if (wants(req, "KNOWLEDGE")) {
    jobs.push((async () => {
      const result = await adapter.fetchKnowledge(req.workspaceId, Math.min(SOURCE_LIMIT, Math.max(limit, 10)));
      pushSourceWarning(warnings, sourceStatus, "knowledge_chunks", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: "KNOWLEDGE",
          source: "knowledge_chunks",
          recordId: row.id,
          subject: row.page_title ?? row.content_type ?? "Knowledge",
          factualStatus: row.summary ? "OBSERVATION" : "FACT",
          content: row.summary ?? row.content,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }
    })());
  } else sourceStatus.knowledge_chunks = "NOT_USED";

  if (wants(req, "INTERACTION")) {
    jobs.push((async () => {
      const result = await adapter.fetchInterestMemory(req.workspaceId, Math.min(SOURCE_LIMIT, limit));
      pushSourceWarning(warnings, sourceStatus, "social_interest_memory", result);
      if (!result.ok) return;
      for (const row of result.rows) {
        entries.push(makeEntry({
          workspaceId: req.workspaceId,
          type: "INTERACTION",
          source: "social_interest_memory",
          recordId: row.id,
          subject: `${row.interest_type}: ${row.interest_ref}`,
          factualStatus: "OBSERVATION",
          content: {
            interest_type: row.interest_type,
            interest_ref: row.interest_ref,
            evidence_count: row.evidence_count,
            strength: row.strength,
            source_provider: row.source_provider,
            first_seen_at: row.first_seen_at,
            last_seen_at: row.last_seen_at,
          },
          createdAt: row.created_at,
          updatedAt: row.updated_at ?? row.last_seen_at,
        }));
      }
    })());
  } else sourceStatus.social_interest_memory = "NOT_USED";

  // Deliberate exclusions until a workspace-safe mapping is proven on this branch.
  sourceStatus.business_memory = "NOT_USED";
  sourceStatus.customer_journey = "NOT_USED";
  warnings.push(
    "business_memory/customer_journey use a separate business_id model; AI-4 does not invent a workspace mapping.",
  );

  await Promise.all(jobs);

  return {
    success: true,
    workspaceId: req.workspaceId,
    entries: dedupeAndRankMemory(entries, req.query, limit),
    warnings,
    sourceStatus,
  };
}

export function buildMemoryContextBlock(memory: PulseMemoryResponse): string {
  if (!memory.success || memory.entries.length === 0) return "";
  const lines = [
    "\n\n[VERIFIED WORKSPACE MEMORY — AI-4]",
    "Use this context as evidence, not as permission to execute actions.",
    "AI_INFERENCE entries are not verified facts.",
  ];
  let length = lines.join("\n").length;
  for (const entry of memory.entries) {
    const line = `- [${entry.memoryType}/${entry.factualStatus}] ${entry.subject}: ${entry.content}`;
    if (length + line.length > MAX_CONTEXT_CHARS) break;
    lines.push(line);
    length += line.length + 1;
  }
  lines.push("[/VERIFIED WORKSPACE MEMORY]");
  return lines.join("\n");
}

// Supabase adapter. The service-role client is allowed here only because every
// query below retains an explicit workspace predicate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSupabaseMemoryAdapter(sb: any): PulseMemoryAdapter {
  const result = <T>(data: T[] | null, error: { message?: string } | null): SourceResult<T> => ({
    ok: !error,
    rows: error ? [] : (data ?? []),
    error: error?.message,
  });

  return {
    async verifyContact(workspaceId, contactId) {
      // First try canonical enriched-contact row id, then contact identifier.
      let q = await sb
        .from("enriched_contacts")
        .select("id,contact_identifier")
        .eq("workspace_id", workspaceId)
        .eq("id", contactId)
        .maybeSingle();
      if (!q.error && q.data) {
        return { ok: true, scoped: true, resolvedIdentifier: q.data.contact_identifier };
      }

      q = await sb
        .from("enriched_contacts")
        .select("id,contact_identifier")
        .eq("workspace_id", workspaceId)
        .eq("contact_identifier", contactId)
        .maybeSingle();
      if (!q.error && q.data) {
        return { ok: true, scoped: true, resolvedIdentifier: q.data.contact_identifier };
      }

      const mem = await sb
        .from("ai_conversation_memory")
        .select("id,contact_identifier")
        .eq("workspace_id", workspaceId)
        .eq("contact_identifier", contactId)
        .limit(1);
      if (mem.error) return { ok: false, scoped: false, error: mem.error.message };
      if (mem.data?.length) {
        return { ok: true, scoped: true, resolvedIdentifier: mem.data[0].contact_identifier };
      }
      return { ok: true, scoped: false };
    },

    async verifyConversation(workspaceId, conversationId) {
      const { data, error } = await sb
        .from("conversation_threads")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", conversationId)
        .maybeSingle();
      if (error) return { ok: false, scoped: false, error: error.message };
      return { ok: true, scoped: Boolean(data) };
    },

    async fetchBusinessProfiles(workspaceId, limit) {
      const { data, error } = await sb
        .from("business_profiles")
        .select("id,business_name,short_description,industry,target_audience,mission_values,main_services,ai_tone,language,created_at,updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      return result<BusinessProfileRow>(data, error);
    },

    async fetchConversationMemory(workspaceId, resolvedContactIdentifier, limit) {
      let query = sb
        .from("ai_conversation_memory")
        .select("id,contact_identifier,contact_name,memory_type,summary,key_facts,sentiment_trend,last_interaction_at,interaction_count,created_at,updated_at")
        .eq("workspace_id", workspaceId);
      if (resolvedContactIdentifier) query = query.eq("contact_identifier", resolvedContactIdentifier);
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(limit);
      return result<ConversationMemoryRow>(data, error);
    },

    async fetchConversationThread(workspaceId, conversationId) {
      const { data, error } = await sb
        .from("conversation_threads")
        .select("id,subject,status,priority,channel_type,contact_name,contact_identifier,ai_summary,last_message_preview,last_message_at,message_count,created_at,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("id", conversationId)
        .limit(1);
      return result<ConversationThreadRow>(data, error);
    },

    async fetchEnrichedContact(workspaceId, resolvedContactIdentifier) {
      const { data, error } = await sb
        .from("enriched_contacts")
        .select("id,contact_identifier,contact_name,channel_types,total_messages,total_leads,total_deals,total_deal_value,avg_intent_score,last_seen_at,last_channel,tags,sentiment_summary,ai_profile_summary,is_opted_out,created_at,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("contact_identifier", resolvedContactIdentifier)
        .limit(2);
      return result<EnrichedContactRow>(data, error);
    },

    async fetchKnowledge(workspaceId, limit) {
      const { data, error } = await sb
        .from("knowledge_chunks")
        .select("id,source_id,content,summary,topic_tags,content_type,page_url,page_title,created_at,updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      return result<KnowledgeChunkRow>(data, error);
    },

    async fetchInterestMemory(workspaceId, limit) {
      const { data, error } = await sb
        .from("social_interest_memory")
        .select("id,interest_type,interest_ref,evidence_count,strength,source_provider,first_seen_at,last_seen_at,state,created_at,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("state", "active")
        .order("last_seen_at", { ascending: false })
        .limit(limit);
      return result<InterestMemoryRow>(data, error);
    },
  };
}

// Convenience entry point used by AI-2. Keeping adapter creation here ensures
// all memory consumers use the same workspace-scoped source contracts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveWorkspaceMemory(sb: any, req: PulseMemoryRequest): Promise<PulseMemoryResponse> {
  return retrieveUnifiedMemory(createSupabaseMemoryAdapter(sb), req);
}
