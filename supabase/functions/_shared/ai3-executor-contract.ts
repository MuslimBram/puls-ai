export const AI3_SUPPORTED_EXECUTOR_TYPES = new Set<string>([
  "launch_campaign",
  "create_booking",
]);

export const AI3_UNSUPPORTED_EXECUTOR_TYPES = new Set<string>([
  "send_message",
  "bulk_email",
  "bulk_sms",
  "execute_automation",
  "suggest_offer",
  "suggest_campaign",
  "suggest_reply",
  "create_offer",
  "issue_reward",
  "issue_discount",
  "issue_referral",
  "seo_opportunity",
  "competitor_insight",
]);

export interface ExecutorDispatchContext {
  actionId: string;
  workspaceId: string;
  userId?: string | null;
  payload: Record<string, unknown>;
}

export interface ExecutorInvocation {
  functionName: string;
  method: "POST";
  query?: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ExecutorAuditInfo {
  canonicalExecutor: string;
  authModel: string;
  successContract: string;
}

export type ExecutorResolution =
  | { supported: true; invocation: ExecutorInvocation; audit: ExecutorAuditInfo }
  | { supported: false; code: string; message: string };

const SERVICE_ROLE_INTERNAL_AUTH = "service-role bearer + x-internal-secret";

export function isInternalServiceRequest(options: {
  authHeader: string | null;
  internalSecretHeader: string | null;
  serviceRoleKey: string;
  internalSecret: string | null;
}): boolean {
  const bearerToken = options.authHeader?.startsWith("Bearer ")
    ? options.authHeader.slice("Bearer ".length).trim()
    : "";

  return Boolean(
    bearerToken &&
      options.internalSecret &&
      bearerToken === options.serviceRoleKey &&
      options.internalSecretHeader === options.internalSecret,
  );
}

function getString(payload: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeBookingDateTime(payload: Record<string, unknown>): { date?: string; time?: string } {
  const date = getString(payload, "date");
  const time = getString(payload, "time");
  if (date && time) return { date, time };

  const scheduledAt = getString(payload, "scheduled_at", "starts_at", "start");
  if (!scheduledAt) return {};

  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return {};

  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toISOString().slice(11, 16),
  };
}

export function buildAi3ExecutorInvocation(ctx: ExecutorDispatchContext, actionType: string): ExecutorResolution {
  switch (actionType) {
    case "launch_campaign": {
      const campaignId = getString(ctx.payload, "campaign_id");
      if (!campaignId) {
        return {
          supported: false,
          code: "INVALID_LAUNCH_CAMPAIGN_PAYLOAD",
          message: "[AI-3] launch_campaign requires campaign_id",
        };
      }

      if (!ctx.userId) {
        return {
          supported: false,
          code: "INVALID_LAUNCH_CAMPAIGN_CONTEXT",
          message: "[AI-3] launch_campaign requires verified user context",
        };
      }

      const body: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        campaign_id: campaignId,
        ai3_action_id: ctx.actionId,
      };

      const segmentId = getString(ctx.payload, "segment_id");
      const channelOverride = getString(ctx.payload, "channel_override");
      const scheduledAt = getString(ctx.payload, "scheduled_at");

      if (segmentId) body.segment_id = segmentId;
      if (channelOverride) body.channel_override = channelOverride;
      if (scheduledAt) body.scheduled_at = scheduledAt;

      return {
        supported: true,
        invocation: {
          functionName: "launch-campaign-broadcast",
          method: "POST",
          body,
        },
        audit: {
          canonicalExecutor: "launch-campaign-broadcast",
          authModel: SERVICE_ROLE_INTERNAL_AUTH,
          successContract: "HTTP 2xx with { ok: true, campaign_id, broadcasts_created }",
        },
      };
    }

    case "create_booking": {
      const clientName = getString(ctx.payload, "client_name");
      const { date, time } = normalizeBookingDateTime(ctx.payload);

      if (!clientName || !date || !time) {
        return {
          supported: false,
          code: "INVALID_BOOKING_PAYLOAD",
          message: "[AI-3] create_booking requires validated client_name, date, and time",
        };
      }

      const body: Record<string, unknown> = {
        workspace_id: ctx.workspaceId,
        client_name: clientName,
        date,
        time,
      };

      const optionalFields: Array<[string, string[]]> = [
        ["type_id", ["type_id", "appointment_type_id"]],
        ["client_email", ["client_email", "customer_email"]],
        ["client_phone", ["client_phone", "customer_phone"]],
        ["notes", ["notes"]],
      ];

      for (const [targetKey, keys] of optionalFields) {
        const value = getString(ctx.payload, ...keys);
        if (value) body[targetKey] = value;
      }

      return {
        supported: true,
        invocation: {
          functionName: "appointment-booking",
          method: "POST",
          query: { action: "book" },
          body,
        },
        audit: {
          canonicalExecutor: "appointment-booking?action=book",
          authModel: SERVICE_ROLE_INTERNAL_AUTH,
          successContract: "HTTP 2xx with { success: true, appointment_id }",
        },
      };
    }

    default:
      if (AI3_UNSUPPORTED_EXECUTOR_TYPES.has(actionType)) {
        return {
          supported: false,
          code: "UNSUPPORTED_EXECUTOR",
          message: `[AI-3] Action type '${actionType}' has no verified safe canonical internal executor`,
        };
      }

      return {
        supported: false,
        code: "UNKNOWN_ACTION_TYPE",
        message: `[AI-3] Unknown action type '${actionType}'. No executor available.`,
      };
  }
}

export function isSuccessfulExecutorResult(
  actionType: string,
  responseBody: Record<string, unknown> | null,
): boolean {
  switch (actionType) {
    case "launch_campaign":
      return responseBody?.ok === true &&
        typeof responseBody.campaign_id === "string" &&
        Array.isArray(responseBody.broadcasts_created);

    case "create_booking":
      return responseBody?.success === true &&
        typeof responseBody.appointment_id === "string";

    default:
      return false;
  }
}
