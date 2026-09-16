/**
 * CANONICAL QUOTA REGISTRY (frontend mirror — DO NOT EDIT BY HAND).
 *
 * Mechanical mirror of supabase/functions/_shared/quota-registry.ts.
 * Edit .faza1c/quota-data.json, run `node .faza1c/gen-quota.cjs`, commit all three.
 */

export type QuotaEnforcement = "enforced" | "not_enforced";

/** Whose limit it is: a property of the workspace, or of the calling user. */
export type QuotaScope = "workspace" | "user";

/**
 * The `resource` values enforce-limits accepts, in registry order. Derived from
 * the registry, never typed by hand: a resource exists only for a quota that
 * something enforces.
 */
export const ENFORCE_LIMITS_RESOURCES = ["channels", "keywords", "team_members", "ai_replies", "leads", "automation_rules"] as const;
export type EnforceLimitsResource = (typeof ENFORCE_LIMITS_RESOURCES)[number];

/** The subset of resources whose count belongs to the workspace, not the caller. */
export const WORKSPACE_SCOPED_RESOURCES: readonly EnforceLimitsResource[] = ["channels", "team_members", "leads", "automation_rules"];

export interface CanonicalQuota {
  /** The PlanLimits field name the frontend uses. */
  readonly key: string;
  /** The pricing_settings column it is read from. */
  readonly column: string;
  /** Label for any surface that renders it. */
  readonly label: string;
  readonly enforcement: QuotaEnforcement;
  /** Declared only for an enforced quota; null means nothing counts it. */
  readonly scope: QuotaScope | null;
  /** The enforce-limits resource name; null when no branch serves it. */
  readonly resource: EnforceLimitsResource | null;
  /** What actually refuses when the number is exceeded. Empty means nothing does. */
  readonly enforcedBy: readonly string[];
  /** True only when that enforcement is code this branch delivers. */
  readonly enforcementShipsInThisBranch: boolean;
  /** standard / professional / advanced / enterprise, as the catalogue holds them. */
  readonly catalogueValues: string;
  /** Where usage is counted, or "none". */
  readonly usageSource: string;
  readonly evidence: string;
  readonly gap?: string;
}

export const CANONICAL_QUOTAS: readonly CanonicalQuota[] = [
  {
    key: "channels",
    column: "channels_limit",
    label: "Channels",
    enforcement: "enforced",
    scope: "workspace",
    resource: "channels",
    enforcedBy: ["enforce-limits resource=channels (deployed v53, HTTP 403 on refusal)", "trigger trg_channels_enforce_workspace_limit (Faza 1A, applied as 20260915182213)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "3 / 10 / 25 / unlimited",
    usageSource:
      "counted live from the channels table, scoped to the workspace",
    evidence:
      "src/hooks/useChannels.ts and src/components/TelegramSetup.tsx call assertWithinLimit({resource:\"channels\", workspaceId}) before every insert, through src/lib/enforceLimits.ts; enforce-limits counts the workspace and refuses with HTTP 403; the BEFORE INSERT trigger refuses a client that skipped the function",
  },

  {
    key: "keywords",
    column: "keywords_limit",
    label: "Keywords",
    enforcement: "enforced",
    scope: "user",
    resource: "keywords",
    enforcedBy: ["enforce-limits resource=keywords (deployed v53, HTTP 403 on refusal)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "50 / 150 / 500 / unlimited",
    usageSource:
      "counted live from the keywords table, scoped to the caller",
    evidence:
      "src/hooks/useKeywords.ts calls assertWithinLimit({resource:\"keywords\"}) before every insert; supabase/functions/enforce-limits/index.ts counts and refuses",
    gap:
      "One layer only: there is no database trigger, so a client that does not call enforce-limits is not refused (REPORT 56 §9). A trigger would be a migration outside Faza 1A and outside Faza 2 scope.",
  },

  {
    key: "teamMembers",
    column: "team_members_limit",
    label: "Team members",
    enforcement: "enforced",
    scope: "workspace",
    resource: "team_members",
    enforcedBy: ["trigger trg_workspace_members_enforce_limit (Faza 1A, applied as 20260915182213)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "3 / 10 / 25 / unlimited",
    usageSource:
      "counted live from workspace_members, scoped to the workspace",
    evidence:
      "supabase/functions/enforce-limits/index.ts has a team_members branch, but NO frontend caller ever passes resource=team_members — the only thing that actually refuses is the Faza 1A BEFORE INSERT trigger on workspace_members",
    gap:
      "Enforced by the database trigger alone. The edge-function branch is unreachable today: grep for assertWithinLimit callers returns channels, keywords and automation_rules.",
  },

  {
    key: "aiRepliesPerDay",
    column: "ai_replies_per_day_limit",
    label: "AI replies / day",
    enforcement: "enforced",
    scope: "user",
    resource: "ai_replies",
    enforcedBy: ["ai-router (in-function)", "generate-reply v51 (in-function, catalogue read)", "dedicated-ai-reply v51 (in-function, catalogue read)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "25 / 75 / 200 / unlimited",
    usageSource:
      "subscriptions.ai_replies_today, reset by ai_replies_reset_at",
    evidence:
      "generate-reply v51 and dedicated-ai-reply v51 resolve the limit through _shared/plan-limits.ts resolveAiReplyLimit() and refuse at effectiveUsed >= dailyLimit (Faza 1A, REPORT 56); ai-router/index.ts in the repo does the same",
    gap:
      "ai-router v65 (deployed) predates the shared resolver: it reads the catalogue but wraps its quota block in `if (sub)`, so an account with no subscriptions row is not limited on that path. The repo ai-router uses the shared resolver and is not deployed (REPORT 56 §9).",
  },

  {
    key: "leadsPerMonth",
    column: "leads_per_month_limit",
    label: "Leads / month",
    enforcement: "enforced",
    scope: "workspace",
    resource: "leads",
    enforcedBy: ["trigger trg_leads_enforce_monthly_limit (Faza 2)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "100 / 500 / 2000 / unlimited",
    usageSource:
      "counted live from the leads table: rows created since the start of the current calendar month (UTC), scoped to the workspace, through public.leads_used_this_month(workspace_id). subscriptions.leads_used is NOT the source: only email-poll ever incremented it and reset_monthly_usage() is scheduled by nothing.",
    evidence:
      "supabase/migrations/20260915190000_faza2_quota_enforcement_triggers.sql: a BEFORE INSERT trigger on leads resolves the workspace owner's plan through effective_plan_for_user(), reads leads_per_month_limit and refuses with check_violation. enforce-limits resource=leads counts through the same SQL function, but it still has no caller — leads are created server-side by the ingest functions — so the trigger is the gate.",
    gap:
      "Denial behaviour is per writer: sms-webhook, webchat-ingest and webhook-ingest log the refusal and keep the inbox message; email-poll does not read its insert result, so the message is kept and the lead is silently not created. The frontend usage bar reads leads_used_this_month(), never subscriptions.leads_used.",
  },

  {
    key: "socialProfiles",
    column: "social_profiles_limit",
    label: "Social profiles",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "2 / 5 / 15 / unlimited",
    usageSource:
      "none",
    evidence:
      "no table or column models a social profile: information_schema holds no social_profiles or social_accounts relation, and no code path reads social_profiles_limit outside the admin catalogue editor",
    gap:
      "MISSING (Faza 2): there is nothing to count. Enforcement needs a data model first, and none is invented here. Sold in the catalogue, not rendered in any plan card.",
  },

  {
    key: "keywordsPerGroup",
    column: "keywords_per_group_limit",
    label: "Keywords per group",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "10 / 25 / 50 / unlimited",
    usageSource:
      "none",
    evidence:
      "keywords has no group column and there is no keyword-groups table; keywords_per_group_limit is read by nothing outside the admin catalogue editor",
    gap:
      "MISSING (Faza 2): the parent keywords_limit is enforced; a per-group limit has no group to count against. Easy to mistake for covered because its parent quota is enforced. It is not.",
  },

  {
    key: "automationRules",
    column: "automation_rules_limit",
    label: "Automation rules",
    enforcement: "enforced",
    scope: "workspace",
    resource: "automation_rules",
    enforcedBy: ["enforce-limits resource=automation_rules (Faza 2, HTTP 403 on refusal)", "trigger trg_automation_workflows_enforce_workspace_limit (Faza 2)"],
    enforcementShipsInThisBranch: true,
    catalogueValues: "5 / 15 / 50 / unlimited",
    usageSource:
      "counted live from automation_workflows (every rule, active or not), scoped to the workspace",
    evidence:
      "src/hooks/useAutomations.ts calls assertWithinLimit({resource:\"automation_rules\", workspaceId}) before every insert; enforce-limits counts the workspace and refuses with HTTP 403; supabase/migrations/20260915190000_faza2_quota_enforcement_triggers.sql adds a BEFORE INSERT trigger that refuses a client that skipped the function, including install-industry-pack",
  },

  {
    key: "conversationHistoryDays",
    column: "conversation_history_days",
    label: "Conversation history",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "30 / 90 / 180 / 365 days",
    usageSource:
      "inbox_messages.created_at and conversation_threads.created_at exist, but nothing prunes or windows them by plan",
    evidence:
      "no retention job, no query filter, no RLS window and no trigger reads conversation_history_days — verified against cron.job, pg_trigger and pg_proc on 2026-09-15",
    gap:
      "BLOCKED (Faza 2): enforcing a retention window means either deleting customer messages (destructive, irreversible) or hiding them behind a plan-aware read policy on two high-traffic tables. Both are product decisions, not an enforcement patch. Until decided, every plan keeps history indefinitely and the number is not a fact.",
  },

  {
    key: "imagesPerMonth",
    column: "daily_image_limit",
    label: "Images / day",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "5 / 15 / 50 / unlimited",
    usageSource:
      "media_usage_daily.image_count — written by consume_media_quota() / ensure_media_daily_usage() (SECURITY DEFINER, present in production) and read by job-worker / job-worker-core",
    evidence:
      "the only production consumer is generate-media v50, known drifted: it hard-codes 100/30/10, does not handle the advanced plan and writes to media_generation_usage, which does not exist. The repo generate-media enforces this through _shared/media-policy.ts.",
    gap:
      "DEFERRED (owner instruction, Faza 2): media quotas are not wired to generate-media v50 here; they belong to the media Big Step. The field name says Month while the column and the UI say day.",
  },

  {
    key: "videosPerMonth",
    column: "daily_video_limit",
    label: "Videos / day",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "2 / 5 / 15 / unlimited",
    usageSource:
      "media_usage_daily.video_count — written by consume_media_quota() / ensure_media_daily_usage() and read by job-worker / job-worker-core",
    evidence:
      "same as imagesPerMonth; deployed generate-media v50 hard-codes 20/5/1",
    gap:
      "DEFERRED (owner instruction, Faza 2): belongs to the media Big Step. Same Month-vs-day naming defect.",
  },

  {
    key: "videoMaxSeconds",
    column: "max_video_seconds",
    label: "Max seconds per clip",
    enforcement: "not_enforced",
    scope: null,
    resource: null,
    enforcedBy: [],
    enforcementShipsInThisBranch: false,
    catalogueValues: "15 / 30 / 60 / 120 seconds",
    usageSource:
      "media_usage_daily.video_seconds_used — written by the 7-argument consume_media_quota() overload against video_seconds_limit",
    evidence:
      "pricing_settings also carries daily_video_seconds_limit, which no frontend field maps to; src/lib/mediaPolicy.ts derives it as videosPerMonth * videoMaxSeconds instead of reading the column",
    gap:
      "DEFERRED (owner instruction, Faza 2): belongs to the media Big Step. It is a per-clip ceiling, not a daily total.",
  },
] as const;

const BY_KEY: Readonly<Record<string, CanonicalQuota>> = Object.freeze(
  Object.fromEntries(CANONICAL_QUOTAS.map((x) => [x.key, x])),
);

const BY_RESOURCE: Readonly<Record<string, CanonicalQuota>> = Object.freeze(
  Object.fromEntries(CANONICAL_QUOTAS.filter((x) => x.resource).map((x) => [x.resource as string, x])),
);

export const getQuota = (key: string): CanonicalQuota | null =>
  Object.prototype.hasOwnProperty.call(BY_KEY, key) ? BY_KEY[key] : null;

/** The quota behind an enforce-limits resource name, or null for an unknown one. */
export const quotaForResource = (resource: string): CanonicalQuota | null =>
  Object.prototype.hasOwnProperty.call(BY_RESOURCE, resource) ? BY_RESOURCE[resource] : null;

/**
 * True only when something on the server refuses once the number is exceeded.
 *
 * This is the question the UI must ask before rendering a denominator. A limit
 * that is sold but not enforced may be shown as usage; it must not be shown as
 * a ceiling, because there is no ceiling.
 */
export const isQuotaEnforced = (key: string): boolean => getQuota(key)?.enforcement === "enforced";

export const ENFORCED_QUOTA_KEYS: readonly string[] = CANONICAL_QUOTAS.filter(
  (x) => x.enforcement === "enforced",
).map((x) => x.key);

export const NOT_ENFORCED_QUOTA_KEYS: readonly string[] = CANONICAL_QUOTAS.filter(
  (x) => x.enforcement === "not_enforced",
).map((x) => x.key);
