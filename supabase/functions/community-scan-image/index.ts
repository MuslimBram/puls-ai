// supabase/functions/community-scan-image/index.ts
// PULSE AI — LIDHJET NATIVE MODULE
// PRE3: image classifier verdict parsing + durable idempotent result reuse

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  CORS_HEADERS,
  jsonResponse,
  errorResponse,
  createSupabaseClients,
  getAuthUser,
  resolveAiWorkspace,
  parseCommunityEventId,
} from "../community-shared/helpers.ts";

type ScanResult = {
  safe: boolean;
  label: string;
  confidence: number;
  flags: string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_LABELS = new Set([
  "clean",
  "sexual",
  "nudity",
  "violence",
  "hate",
  "harassment",
  "self_harm",
  "drugs",
  "weapons",
  "illegal_goods",
  "graphic",
  "other",
]);

function validateScanResult(value: unknown): ScanResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI image classifier verdict is not an object");
  }

  const verdict = value as Record<string, unknown>;
  const safe = verdict.safe;
  const label = verdict.label;
  const confidence = verdict.confidence;
  const flags = verdict.flags ?? [];

  if (typeof safe !== "boolean") {
    throw new Error("AI image classifier verdict is missing boolean safe");
  }
  if (typeof label !== "string" || !label.trim() || label.length > 80) {
    throw new Error("AI image classifier verdict has invalid label");
  }

  const normalizedLabel = label.trim().toLowerCase();
  if (!ALLOWED_LABELS.has(normalizedLabel)) {
    throw new Error("AI image classifier verdict has unsupported label");
  }
  if ((safe && normalizedLabel !== "clean") || (!safe && normalizedLabel === "clean")) {
    throw new Error("AI image classifier verdict is internally inconsistent");
  }

  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI image classifier verdict has invalid confidence");
  }
  if (!Array.isArray(flags)
      || flags.length > 20
      || flags.some((flag) => typeof flag !== "string" || flag.length > 160)) {
    throw new Error("AI image classifier verdict has invalid flags");
  }

  return {
    safe,
    label: normalizedLabel,
    confidence,
    flags: flags as string[],
  };
}

function parseRouterScanResult(routerData: unknown): ScanResult {
  if (!routerData || typeof routerData !== "object") {
    throw new Error("Invalid AI router response format");
  }

  const data = routerData as Record<string, unknown>;
  const raw = data.response ?? data.content ?? data.text;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("AI router did not return a classifier payload");
  }

  const normalized = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("AI image classifier returned non-JSON output");
  }

  return validateScanResult(parsed);
}

function normalizePublicHttpsImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;

    const host = url.hostname.toLowerCase();
    if (!host
        || host === "localhost"
        || host.endsWith(".localhost")
        || host.endsWith(".local")
        || host.includes(":")
        || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
        || !/^[a-z0-9.-]+$/.test(host)
        || !host.includes(".")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse("POST required", 405, "METHOD_NOT_ALLOWED");
  }

  try {
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { request_id, workspace_id, image_url, mime_type, file_size_bytes, post_id } = body;
    const moduleName = "community_image_scan";

    const parsedRequest = parseCommunityEventId(request_id);
    if (!parsedRequest.ok) {
      return errorResponse(parsedRequest.message, 400, "INVALID_REQUEST_ID");
    }
    const requestId = parsedRequest.eventId;

    const imageUrl = normalizePublicHttpsImageUrl(image_url);
    if (!imageUrl) {
      return errorResponse("image_url must be a public HTTPS URL", 400, "INVALID_IMAGE_URL");
    }

    if (workspace_id !== undefined && workspace_id !== null
        && (typeof workspace_id !== "string" || !UUID_RE.test(workspace_id.trim()))) {
      return errorResponse("Invalid workspace_id", 400, "INVALID_WORKSPACE_ID");
    }
    const explicitWorkspaceId = typeof workspace_id === "string" && workspace_id.trim()
      ? workspace_id.trim()
      : null;

    if (post_id !== undefined && post_id !== null
        && (typeof post_id !== "string" || !UUID_RE.test(post_id.trim()))) {
      return errorResponse("Invalid post_id", 400, "INVALID_POST_ID");
    }
    const postId = typeof post_id === "string" && post_id.trim() ? post_id.trim() : null;

    const normalizedMime = mime_type === undefined || mime_type === null || mime_type === ""
      ? null
      : String(mime_type).trim().toLowerCase();
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (normalizedMime && !allowedMimes.includes(normalizedMime)) {
      return errorResponse(`Unsupported image MIME type '${normalizedMime}'`, 400, "UNSUPPORTED_MIME_TYPE");
    }

    let normalizedFileSize: number | null = null;
    if (file_size_bytes !== undefined && file_size_bytes !== null && file_size_bytes !== "") {
      const parsedSize = Number(file_size_bytes);
      const maxSizeBytes = 10 * 1024 * 1024;
      if (!Number.isFinite(parsedSize) || parsedSize < 0 || !Number.isInteger(parsedSize)) {
        return errorResponse("Invalid image size", 400, "INVALID_IMAGE_SIZE");
      }
      if (parsedSize > maxSizeBytes) {
        return errorResponse("Image size exceeds 10MB limit", 400, "IMAGE_SIZE_EXCEEDED");
      }
      normalizedFileSize = parsedSize;
    }

    const { workspaceId, via } = await resolveAiWorkspace(user.id, explicitWorkspaceId, adminClient);
    const inputHash = await sha256Hex(JSON.stringify({
      workspace_id: workspaceId,
      post_id: postId,
      image_url: imageUrl,
      mime_type: normalizedMime,
      file_size_bytes: normalizedFileSize,
    }));

    const { data: claim, error: claimError } = await adminClient.rpc("claim_community_ai_request", {
      p_user_id: user.id,
      p_module: moduleName,
      p_daily_limit: 5,
      p_request_id: requestId,
      p_via: via,
      p_workspace_id: workspaceId,
    });

    if (claimError) {
      console.error("[COMMUNITY-SCAN-IMAGE] claim failed", { code: claimError.code });
      return errorResponse("Unable to reserve image scan", 503, "CLAIM_FAILED");
    }

    if (!claim.allowed) {
      if (claim.code === "409_in_progress") {
        return errorResponse("Request is currently in progress", 409, "409_IN_PROGRESS");
      }
      if (claim.code === "daily_limit_exceeded") {
        return errorResponse("Daily AI scan limit reached", 429, "DAILY_LIMIT_EXCEEDED");
      }
      if (claim.reused) {
        if (claim.status === "completed") {
          const recordId = claim.record_id;
          if (!recordId) {
            return errorResponse("Completed image scan is missing its usage record", 409, "PERSISTED_VERDICT_MISSING");
          }

          const { data: priorUsage, error: priorError } = await adminClient
            .from("community_ai_usage")
            .select("result_json")
            .eq("id", recordId)
            .eq("user_id", user.id)
            .eq("module", moduleName)
            .maybeSingle();

          if (priorError || !priorUsage?.result_json || typeof priorUsage.result_json !== "object") {
            return errorResponse("Completed image scan has no persisted verdict", 409, "PERSISTED_VERDICT_MISSING");
          }

          const persisted = priorUsage.result_json as Record<string, unknown>;
          if (typeof persisted.input_sha256 !== "string") {
            return errorResponse("Completed image scan has no input fingerprint", 409, "PERSISTED_VERDICT_MISSING");
          }
          if (persisted.input_sha256 !== inputHash) {
            return errorResponse(
              "request_id is already bound to a different image scan payload",
              409,
              "EVENT_ID_PAYLOAD_MISMATCH",
              { request_id: requestId },
            );
          }

          let priorResult: ScanResult;
          try {
            priorResult = validateScanResult(persisted);
          } catch {
            return errorResponse("Persisted image scan verdict is invalid", 409, "PERSISTED_VERDICT_INVALID");
          }

          return jsonResponse({
            success: true,
            status: "completed",
            reused: true,
            scan_result: priorResult,
          });
        }
        if (claim.status === "failed") {
          return errorResponse("Previous image scan failed", 400, "PREVIOUS_REQUEST_FAILED");
        }
      }

      return errorResponse("Image scan request was not claimable", 409, "REQUEST_NOT_CLAIMABLE");
    }

    const usageId = claim.usage_id;
    if (!usageId) {
      return errorResponse("AI request claim did not return usage_id", 500, "CLAIM_MISSING_USAGE_ID");
    }

    let scanResult: ScanResult;
    const mockMode = Deno.env.get("MOCK_AI_ROUTER") === "true" || Deno.env.get("DENO_ENV") === "test";

    try {
      if (mockMode) {
        const mockRaw = Deno.env.get("MOCK_AI_ROUTER_RESULT");
        scanResult = mockRaw
          ? parseRouterScanResult({ response: mockRaw })
          : { safe: true, label: "clean", confidence: 0.98, flags: [] };
      } else {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const routerRes = await fetch(`${supabaseUrl}/functions/v1/ai-router`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.get("Authorization") || "",
          },
          body: JSON.stringify({
            task_type: "multimodal_vision",
            workspace_id: workspaceId,
            user_id: user.id,
            max_tokens: 220,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text:
                      'Classify this community image for safety. Return ONLY strict JSON in this exact shape: {"safe":boolean,"label":"clean|sexual|nudity|violence|hate|harassment|self_harm|drugs|weapons|illegal_goods|graphic|other","confidence":number,"flags":["short_reason"]}. If uncertain, set safe=false and label="other". Do not include markdown or prose.',
                  },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
          }),
        });

        if (!routerRes.ok) {
          throw new Error(`AI Router returned status ${routerRes.status}`);
        }

        const routerData = await routerRes.json();
        scanResult = parseRouterScanResult(routerData);
      }

      const persistedResult = { ...scanResult, input_sha256: inputHash };
      const { data: completedUsage, error: completeError } = await adminClient
        .from("community_ai_usage")
        .update({
          status: "completed",
          result_json: persistedResult,
          completed_at: new Date().toISOString(),
        })
        .eq("id", usageId)
        .eq("status", "reserved")
        .select("id")
        .maybeSingle();

      if (completeError || !completedUsage) {
        throw new Error("Failed to persist image scan verdict");
      }

      return jsonResponse({
        success: true,
        status: "completed",
        reused: false,
        scan_result: scanResult,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "AI image scan failed";
      console.error("[COMMUNITY-SCAN-IMAGE] scan failed", { usage_id: usageId, error: errorMsg });

      await adminClient
        .from("community_ai_usage")
        .update({
          status: "failed",
          error_message: "AI_IMAGE_SCAN_FAILED",
        })
        .eq("id", usageId)
        .eq("status", "reserved");

      return errorResponse("AI image scan failed", 502, "AI_IMAGE_SCAN_FAILED");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const unauthorized = message === "Missing Authorization header" || message === "Unauthorized user token";
    return errorResponse(unauthorized ? message : "Internal server error", unauthorized ? 401 : 500, unauthorized ? "UNAUTHORIZED" : "INTERNAL_ERROR");
  }
});
