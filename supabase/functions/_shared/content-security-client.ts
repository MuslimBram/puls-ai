import { getServiceKey } from "./admin-client.ts";

export type ContentSecurityAction = "allow" | "quarantine" | "reject" | "tag";

export type ContentSecurityDecision = {
  category: string;
  risk_score: number;
  action: ContentSecurityAction;
  reason_code: string;
};

export type ContentSecurityAttachment = {
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
};

export type ContentSecurityInput = {
  workspace_id: string;
  source: string;
  event_id: string;
  content?: string;
  urls?: string[];
  attachment?: ContentSecurityAttachment | null;
};

export type ContentSecurityResult =
  | {
      ok: true;
      reused: boolean;
      decision: ContentSecurityDecision;
    }
  | {
      ok: false;
      retryable: boolean;
      status: number;
      code: string;
    };

const ACTIONS = new Set<ContentSecurityAction>(["allow", "quarantine", "reject", "tag"]);

/** Extract explicit URI-like tokens so deterministic suspicious-link rules run
 * before downstream AI/business processing. The firewall re-validates each URL. */
export function extractSecurityUrls(text: string): string[] {
  const matches = text.match(/\b(?:https?:\/\/|ftp:\/\/|file:\/\/|javascript:|data:)[^\s<>"']+/gi) ?? [];
  const unique = new Set<string>();
  for (const candidate of matches) {
    const normalized = candidate.replace(/[),.;!?]+$/g, "").slice(0, 2048);
    if (normalized) unique.add(normalized);
    if (unique.size >= 50) break;
  }
  return [...unique];
}

function parseDecision(payload: unknown): { reused: boolean; decision: ContentSecurityDecision } | null {
  if (!payload || typeof payload !== "object") return null;
  const outer = payload as Record<string, unknown>;
  const decision = outer.decision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return null;

  const raw = decision as Record<string, unknown>;
  if (typeof raw.category !== "string" || raw.category.length < 2 || raw.category.length > 80) return null;
  if (typeof raw.reason_code !== "string" || raw.reason_code.length < 2 || raw.reason_code.length > 160) return null;
  if (typeof raw.action !== "string" || !ACTIONS.has(raw.action as ContentSecurityAction)) return null;
  if (!Number.isInteger(raw.risk_score) || Number(raw.risk_score) < 0 || Number(raw.risk_score) > 100) return null;

  return {
    reused: outer.reused === true,
    decision: {
      category: raw.category,
      risk_score: Number(raw.risk_score),
      action: raw.action as ContentSecurityAction,
      reason_code: raw.reason_code,
    },
  };
}

/**
 * Internal fail-closed caller for content-security-firewall.
 * Never logs raw content or provider payloads.
 */
export async function scanInboundContent(input: ContentSecurityInput): Promise<ContentSecurityResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  const serviceKey = getServiceKey();

  if (!supabaseUrl || !internalSecret || !serviceKey) {
    return { ok: false, retryable: true, status: 503, code: "CONTENT_SECURITY_NOT_CONFIGURED" };
  }

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/content-security-firewall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, retryable: true, status: 503, code: "CONTENT_SECURITY_UNAVAILABLE" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Fail closed below; do not surface body text because it could contain
    // implementation/provider details.
  }

  if (!response.ok) {
    const code = payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).code === "string"
      ? String((payload as Record<string, unknown>).code)
      : "CONTENT_SECURITY_REJECTED_REQUEST";
    return {
      ok: false,
      retryable: response.status === 409 || response.status >= 500,
      status: response.status,
      code,
    };
  }

  const parsed = parseDecision(payload);
  if (!parsed) {
    return { ok: false, retryable: true, status: 502, code: "CONTENT_SECURITY_INVALID_RESPONSE" };
  }

  return { ok: true, ...parsed };
}

export function blocksNormalIngress(decision: ContentSecurityDecision): boolean {
  return decision.action === "quarantine" || decision.action === "reject";
}
