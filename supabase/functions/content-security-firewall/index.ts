// supabase/functions/content-security-firewall/index.ts
// P0.6 — Universal inbound content security firewall core
// Internal service only. Provider/channel integrations are wired in later phases.

import { createAdminClient, getServiceKey } from "../_shared/admin-client.ts";

type Category =
  | "safe" | "spam" | "scam" | "phishing" | "malware" | "credential_theft"
  | "harassment" | "insult" | "threat" | "violence" | "extortion" | "impersonation"
  | "prompt_injection" | "suspicious_link" | "competitor_or_social_engineering" | "unknown";

type Action = "allow" | "quarantine" | "reject" | "tag";

type Decision = {
  category: Category;
  riskScore: number;
  action: Action;
  reasonCode: string;
  semanticUsed: boolean;
};

type AttachmentInput = {
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
};

type FirewallInput = {
  workspace_id?: unknown;
  source?: unknown;
  event_id?: unknown;
  content?: unknown;
  urls?: unknown;
  attachment?: unknown;
};

const CATEGORIES = new Set<Category>([
  "safe", "spam", "scam", "phishing", "malware", "credential_theft",
  "harassment", "insult", "threat", "violence", "extortion", "impersonation",
  "prompt_injection", "suspicious_link", "competitor_or_social_engineering", "unknown",
]);
const ACTIONS = new Set<Action>(["allow", "quarantine", "reject", "tag"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^[A-Za-z0-9:_-]{8,200}$/;
const SOURCE_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const MAX_CONTENT_LENGTH = 100_000;
const MAX_URLS = 50;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorizedInternalRequest(req: Request): boolean {
  const expectedInternal = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  const expectedServiceKey = getServiceKey();
  const suppliedInternal = req.headers.get("x-internal-secret") ?? "";
  const suppliedServiceKey = req.headers.get("apikey") ?? "";

  return constantTimeEqual(suppliedInternal, expectedInternal)
    && constantTimeEqual(suppliedServiceKey, expectedServiceKey);
}

function normalizeUrls(value: unknown): { urls: string[]; invalid: boolean } {
  if (value === undefined || value === null) return { urls: [], invalid: false };
  if (!Array.isArray(value) || value.length > MAX_URLS) return { urls: [], invalid: true };

  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2048) return { urls: [], invalid: true };
    urls.push(item.trim());
  }
  return { urls, invalid: false };
}

function normalizeAttachment(value: unknown): AttachmentInput | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";

  const input = value as Record<string, unknown>;
  const mimeType = typeof input.mime_type === "string" ? input.mime_type.trim().toLowerCase() : undefined;
  const sizeBytes = input.size_bytes === undefined ? undefined : Number(input.size_bytes);
  const sha256 = typeof input.sha256 === "string" ? input.sha256.trim().toLowerCase() : undefined;

  if (mimeType && mimeType.length > 160) return "invalid";
  if (sizeBytes !== undefined && (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > 1024 * 1024 * 1024)) return "invalid";
  if (sha256 && !SHA256_RE.test(sha256)) return "invalid";

  return { mime_type: mimeType, size_bytes: sizeBytes, sha256 };
}

function scrubForSemanticClassifier(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED_PRIVATE_KEY]")
    .replace(/\b(?:seed phrase|recovery phrase|mnemonic)\s*(?::|=|\bis\b)\s+[A-Za-z]+(?:\s+[A-Za-z]+){5,23}/gi, "[REDACTED_RECOVERY_PHRASE]")
    .replace(/\b(?:password|passcode|pin|otp|one[- ]time(?: password| code)?|verification code)\s*(?::|=|\bis\b)\s*[^\s,;]+/gi, "[REDACTED_CREDENTIAL]")
    .replace(/\b(?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|secret)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED_SECRET_ASSIGNMENT]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, "[REDACTED_BEARER]")
    .replace(/\b(?:sk|rk|pk|sb_secret)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_SECRET]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:\+?\d[\d .()-]{6,}\d)\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{13,19}\b/g, "[REDACTED_CARD]")
    .slice(0, 12_000);
}

function sanitizedUrlForClassifier(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.hostname}${url.pathname}`.slice(0, 500);
  } catch {
    return "[INVALID_URL]";
  }
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deterministicDecision(content: string, urls: string[], attachment: AttachmentInput | null): Decision | null {
  if (attachment) {
    return {
      category: "unknown",
      riskScore: 100,
      action: "quarantine",
      reasonCode: "MALWARE_SCANNER_REQUIRED",
      semanticUsed: false,
    };
  }

  if (!content.trim() && urls.length === 0) {
    return { category: "safe", riskScore: 0, action: "allow", reasonCode: "EMPTY_PAYLOAD", semanticUsed: false };
  }

  const lowered = content.toLowerCase();

  if (/\b(ignore (all |the )?(previous|prior) instructions|reveal (the )?(system|developer) prompt|system prompt|developer message|jailbreak|bypass (the )?(safety|policy))\b/i.test(content)) {
    return { category: "prompt_injection", riskScore: 90, action: "quarantine", reasonCode: "PROMPT_INJECTION_PATTERN", semanticUsed: false };
  }

  if (/\b(password|passcode|otp|one[- ]time code|verification code|seed phrase|recovery phrase|private key|cvv|card number)\b/i.test(content)
      && /\b(send|share|give|enter|provide|confirm|verify|reply|tell)\b/i.test(content)) {
    return { category: "credential_theft", riskScore: 98, action: "reject", reasonCode: "CREDENTIAL_SOLICITATION", semanticUsed: false };
  }

  if (/\b(kill you|hurt you|shoot you|stab you|bomb you|burn your|beat you)\b/i.test(content)) {
    return { category: "threat", riskScore: 97, action: "reject", reasonCode: "DIRECT_THREAT_PATTERN", semanticUsed: false };
  }

  if (/\b(ransom|pay me or|send money or|blackmail|extort)\b/i.test(content)) {
    return { category: "extortion", riskScore: 96, action: "reject", reasonCode: "EXTORTION_PATTERN", semanticUsed: false };
  }

  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { category: "suspicious_link", riskScore: 95, action: "reject", reasonCode: "UNSAFE_URL_SCHEME", semanticUsed: false };
      }
      if (url.username || url.password) {
        return { category: "phishing", riskScore: 96, action: "reject", reasonCode: "URL_EMBEDDED_CREDENTIALS", semanticUsed: false };
      }
      const host = url.hostname.toLowerCase();
      if (host.startsWith("xn--") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
        return { category: "suspicious_link", riskScore: 78, action: "quarantine", reasonCode: "SUSPICIOUS_URL_HOST", semanticUsed: false };
      }
    } catch {
      return { category: "suspicious_link", riskScore: 90, action: "quarantine", reasonCode: "INVALID_URL", semanticUsed: false };
    }
  }

  if (urls.length > 0 && /\b(urgent|verify your account|account suspended|click (here|now)|claim prize|wallet|crypto|wire transfer)\b/i.test(lowered)) {
    return { category: "phishing", riskScore: 88, action: "quarantine", reasonCode: "PHISHING_LINK_CONTEXT", semanticUsed: false };
  }

  return null;
}

function parseSemanticDecision(payload: unknown): Decision | null {
  if (!payload || typeof payload !== "object") return null;
  const outer = payload as Record<string, unknown>;
  const raw = outer.response ?? outer.content ?? outer.text;
  if (typeof raw !== "string") return null;

  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }

  const category = parsed.category;
  const action = parsed.action;
  const riskScore = Number(parsed.risk_score);
  const reasonCode = parsed.reason_code;

  if (typeof category !== "string" || !CATEGORIES.has(category as Category)) return null;
  if (typeof action !== "string" || !ACTIONS.has(action as Action)) return null;
  if (!Number.isInteger(riskScore) || riskScore < 0 || riskScore > 100) return null;
  if (typeof reasonCode !== "string" || !/^[A-Z0-9_:-]{2,80}$/.test(reasonCode)) return null;

  let normalizedAction = action as Action;
  if (category === "unknown" && normalizedAction === "allow") normalizedAction = "quarantine";
  if (category !== "safe" && normalizedAction === "allow") normalizedAction = "quarantine";

  return {
    category: category as Category,
    riskScore,
    action: normalizedAction,
    reasonCode: `SEMANTIC_${reasonCode}`,
    semanticUsed: true,
  };
}

async function runSemanticClassifier(workspaceId: string, content: string, urls: string[]): Promise<Decision | null> {
  if ((Deno.env.get("CONTENT_SECURITY_SEMANTIC_CLASSIFIER_ENABLED") ?? "false").toLowerCase() !== "true") {
    return null;
  }

  const serviceKey = getServiceKey();
  const internalSecret = Deno.env.get("INTERNAL_WEBHOOK_SECRET") ?? "";
  if (!serviceKey || !internalSecret) return null;

  const classifierText = scrubForSemanticClassifier(content);
  const classifierUrls = urls.map(sanitizedUrlForClassifier);
  const prompt = [
    "Classify inbound business content for security. Return ONLY strict JSON.",
    `Allowed categories: ${Array.from(CATEGORIES).join(", ")}.`,
    "Allowed actions: allow, quarantine, reject, tag.",
    "If uncertain use category=unknown and action=quarantine.",
    "reason_code must be an uppercase machine code with no copied user text.",
    `Content: ${classifierText}`,
    `URLs: ${JSON.stringify(classifierUrls)}`,
    'Shape: {"category":"safe","risk_score":0,"action":"allow","reason_code":"BENIGN"}',
  ].join("\n");

  try {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-router`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        task_type: "text_classification",
        workspace_id: workspaceId,
        max_tokens: 180,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;
    return parseSemanticDecision(await response.json());
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptQuarantinePayload(payload: unknown): Promise<{
  ciphertext: string | null;
  iv: string | null;
  alg: "AES-GCM-256" | null;
  stored: boolean;
}> {
  const rawKey = Deno.env.get("CONTENT_SECURITY_QUARANTINE_KEY") ?? "";
  if (!rawKey) return { ciphertext: null, iv: null, alg: null, stored: false };

  try {
    const keyBytes = decodeBase64(rawKey);
    if (keyBytes.length !== 32) return { ciphertext: null, iv: null, alg: null, stored: false };

    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));

    return {
      ciphertext: encodeBase64(encrypted),
      iv: encodeBase64(iv),
      alg: "AES-GCM-256",
      stored: true,
    };
  } catch {
    return { ciphertext: null, iv: null, alg: null, stored: false };
  }
}

async function failClaim(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  source: string,
  eventId: string,
  claimToken: string,
  reason: string,
): Promise<void> {
  await admin.rpc("fail_content_security_event", {
    p_workspace_id: workspaceId,
    p_source: source,
    p_event_id: eventId,
    p_claim_token: claimToken,
    p_reason: reason,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Forbidden", code: "INTERNAL_SERVICE_ONLY" }, 403);
  }
  if (!isAuthorizedInternalRequest(req)) {
    return json({ error: "Forbidden", code: "INTERNAL_SERVICE_ONLY" }, 403);
  }

  let body: FirewallInput;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON", code: "INVALID_INPUT" }, 400);
  }

  if (typeof body.workspace_id !== "string" || !UUID_RE.test(body.workspace_id)) {
    return json({ error: "Invalid workspace_id", code: "INVALID_WORKSPACE" }, 400);
  }
  if (typeof body.source !== "string" || !SOURCE_RE.test(body.source)) {
    return json({ error: "Invalid source", code: "INVALID_SOURCE" }, 400);
  }
  if (typeof body.event_id !== "string" || !EVENT_RE.test(body.event_id)) {
    return json({ error: "Invalid event_id", code: "INVALID_EVENT_ID" }, 400);
  }

  const content = body.content === undefined || body.content === null ? "" : body.content;
  if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
    return json({ error: "Content exceeds firewall input contract", code: "INVALID_CONTENT" }, 413);
  }

  const normalizedUrls = normalizeUrls(body.urls);
  if (normalizedUrls.invalid) {
    return json({ error: "Invalid urls", code: "INVALID_URLS" }, 400);
  }

  const attachment = normalizeAttachment(body.attachment);
  if (attachment === "invalid") {
    return json({ error: "Invalid attachment metadata", code: "INVALID_ATTACHMENT" }, 400);
  }

  const workspaceId = body.workspace_id;
  const source = body.source;
  const eventId = body.event_id;
  const urls = normalizedUrls.urls;
  const admin = createAdminClient();

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError || !workspace) {
    return json({ error: "Workspace not found", code: "WORKSPACE_NOT_FOUND" }, 403);
  }

  // Claim before any classifier/provider call. A concurrent request receives the
  // existing completed decision or 409 while the winning claim is in progress.
  const { data: claim, error: claimError } = await admin.rpc("claim_content_security_event", {
    p_workspace_id: workspaceId,
    p_source: source,
    p_event_id: eventId,
  });

  if (claimError || !claim) {
    return json({ error: "Security claim unavailable", code: "SECURITY_CLAIM_UNAVAILABLE" }, 503);
  }

  if (!claim.allowed) {
    if (claim.status === "completed") {
      return json({
        success: true,
        reused: true,
        event_id: eventId,
        decision: {
          category: claim.category,
          risk_score: claim.risk_score,
          action: claim.action,
          reason_code: claim.decision_reason,
        },
      });
    }

    return json({
      error: "Security event is already being processed",
      code: "SECURITY_EVENT_IN_PROGRESS",
      event_id: eventId,
    }, 409);
  }

  const claimToken = claim.claim_token;
  if (typeof claimToken !== "string" || !UUID_RE.test(claimToken)) {
    return json({ error: "Invalid security claim", code: "SECURITY_CLAIM_INVALID" }, 500);
  }

  try {
    const contentHash = await sha256Hex(JSON.stringify({ content, urls, attachment }));
    let decision = deterministicDecision(content, urls, attachment);
    if (!decision) {
      decision = await runSemanticClassifier(workspaceId, content, urls);
    }
    if (!decision) {
      decision = {
        category: "unknown",
        riskScore: 85,
        action: "quarantine",
        reasonCode: "SEMANTIC_CLASSIFIER_UNAVAILABLE",
        semanticUsed: false,
      };
    }

    const scannerVersions = {
      deterministic: "2026-08-30.2",
      semantic: decision.semanticUsed ? "ai-router:text_classification" : "not_used_or_unavailable",
      malware: attachment ? "required_not_integrated" : "not_applicable",
    };

    const metadata = {
      content_length: content.length,
      url_count: urls.length,
      has_attachment: Boolean(attachment),
      attachment_mime_type: attachment?.mime_type ?? null,
      attachment_size_bytes: attachment?.size_bytes ?? null,
      semantic_classifier_used: decision.semanticUsed,
    };

    const encrypted = decision.action === "quarantine"
      ? await encryptQuarantinePayload({
          content,
          urls,
          attachment: attachment ? {
            mime_type: attachment.mime_type ?? null,
            size_bytes: attachment.size_bytes ?? null,
            sha256: attachment.sha256 ?? null,
          } : null,
        })
      : { ciphertext: null, iv: null, alg: null, stored: false } as const;

    if (decision.action === "quarantine" && !encrypted.stored) {
      await failClaim(admin, workspaceId, source, eventId, claimToken, "QUARANTINE_ENCRYPTION_UNAVAILABLE");
      return json({
        error: "Quarantine storage unavailable",
        code: "QUARANTINE_STORAGE_UNAVAILABLE",
        event_id: eventId,
      }, 503);
    }

    const { data: recorded, error: recordError } = await admin.rpc("finalize_content_security_event", {
      p_workspace_id: workspaceId,
      p_source: source,
      p_event_id: eventId,
      p_claim_token: claimToken,
      p_category: decision.category,
      p_risk_score: decision.riskScore,
      p_action: decision.action,
      p_decision_reason: decision.reasonCode,
      p_content_sha256: contentHash,
      p_scanner_versions: scannerVersions,
      p_metadata: metadata,
      p_quarantine_ciphertext: encrypted.ciphertext,
      p_quarantine_iv: encrypted.iv,
      p_quarantine_alg: encrypted.alg,
      p_quarantine_metadata: {
        payload_stored: encrypted.stored,
        encryption_required: decision.action === "quarantine",
      },
    });

    if (recordError || !recorded) {
      await failClaim(admin, workspaceId, source, eventId, claimToken, "SECURITY_FINALIZE_FAILED");
      return json({ error: "Failed to finalize security decision", code: "SECURITY_FINALIZE_FAILED" }, 500);
    }

    return json({
      success: true,
      reused: false,
      event_id: eventId,
      decision: {
        category: recorded.category,
        risk_score: recorded.risk_score,
        action: recorded.action,
        reason_code: recorded.decision_reason,
      },
      quarantine: recorded.action === "quarantine"
        ? { payload_stored: true, encrypted: true }
        : null,
    });
  } catch {
    await failClaim(admin, workspaceId, source, eventId, claimToken, "CONTENT_SECURITY_PROCESSING_FAILED");
    return json({ error: "Content security processing failed", code: "CONTENT_SECURITY_PROCESSING_FAILED" }, 500);
  }
});
