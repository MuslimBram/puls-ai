/**
 * CANONICAL QUOTA REGISTRY — RUNTIME SUBSET (backend, deployed).
 *
 * Generated from .faza1c/quota-data.json by .faza1c/gen-quota.cjs. DO NOT EDIT.
 *
 * Same twelve entries and the same order as quota-registry.ts, without the
 * audit prose. A deployed function reads the catalogue column, the scope and
 * the enforce-limits resource name from here; it never types a limit name by
 * hand. `src/factory/__tests__/faza2QuotaEnforcement.test.ts` regenerates
 * this file and byte-compares it, and checks it against the full registry.
 */

export type QuotaEnforcement = "enforced" | "not_enforced";
export type QuotaScope = "workspace" | "user";

export const ENFORCE_LIMITS_RESOURCES = ["channels", "keywords", "team_members", "ai_replies", "leads", "automation_rules"] as const;
export type EnforceLimitsResource = (typeof ENFORCE_LIMITS_RESOURCES)[number];

export interface RuntimeQuota {
  readonly key: string;
  readonly column: string;
  readonly enforcement: QuotaEnforcement;
  readonly scope: QuotaScope | null;
  readonly resource: EnforceLimitsResource | null;
}

export const RUNTIME_QUOTAS: readonly RuntimeQuota[] = [
  { key: "channels", column: "channels_limit", enforcement: "enforced", scope: "workspace", resource: "channels" },
  { key: "keywords", column: "keywords_limit", enforcement: "enforced", scope: "user", resource: "keywords" },
  { key: "teamMembers", column: "team_members_limit", enforcement: "enforced", scope: "workspace", resource: "team_members" },
  { key: "aiRepliesPerDay", column: "ai_replies_per_day_limit", enforcement: "enforced", scope: "user", resource: "ai_replies" },
  { key: "leadsPerMonth", column: "leads_per_month_limit", enforcement: "enforced", scope: "workspace", resource: "leads" },
  { key: "socialProfiles", column: "social_profiles_limit", enforcement: "not_enforced", scope: null, resource: null },
  { key: "keywordsPerGroup", column: "keywords_per_group_limit", enforcement: "not_enforced", scope: null, resource: null },
  { key: "automationRules", column: "automation_rules_limit", enforcement: "enforced", scope: "workspace", resource: "automation_rules" },
  { key: "conversationHistoryDays", column: "conversation_history_days", enforcement: "not_enforced", scope: null, resource: null },
  { key: "imagesPerMonth", column: "daily_image_limit", enforcement: "not_enforced", scope: null, resource: null },
  { key: "videosPerMonth", column: "daily_video_limit", enforcement: "not_enforced", scope: null, resource: null },
  { key: "videoMaxSeconds", column: "max_video_seconds", enforcement: "not_enforced", scope: null, resource: null },
] as const;

/** Every pricing_settings column the registry names, for one catalogue read. */
export const QUOTA_COLUMNS: readonly string[] = RUNTIME_QUOTAS.map((x) => x.column);

const BY_RESOURCE: Readonly<Record<string, RuntimeQuota>> = Object.freeze(
  Object.fromEntries(RUNTIME_QUOTAS.filter((x) => x.resource).map((x) => [x.resource as string, x])),
);

/** The quota behind an enforce-limits resource name, or null for an unknown one. */
export const quotaForResource = (resource: string): RuntimeQuota | null =>
  Object.prototype.hasOwnProperty.call(BY_RESOURCE, resource) ? BY_RESOURCE[resource] : null;

/** True when the resource's count belongs to the workspace, not the caller. */
export const isWorkspaceScopedResource = (resource: string): boolean =>
  quotaForResource(resource)?.scope === "workspace";
