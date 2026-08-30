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
} from "../community-shared/helpers.ts";

type ScanResult = {
  safe: boolean;
  label: string;
  confidence: number;
  flags: string[];
};

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

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI image classifier verdict is not an object");
  }

  const verdict = parsed as Record<string, unknown>;
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
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("AI image classifier verdict has invalid confidence");
  }
  if (!Array.isArray(flags) || flags.some((flag) => typeof flag !== "string")) {
    throw new Error("AI image classifier verdict has invalid flags");
  }

  return {
    safe,
    label: label.trim().toLowerCase(),
    confidence,
    flags: (flags as string[]).slice(0, 20),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { userClient, adminClient } = createSupabaseClients(req);
    const user = await getAuthUser(req, userClient);

    const body = await req.json();
    const { request_id, workspace_id, image_url, mime_type, file_size_bytes } = body;
    const moduleName = "community_image_scan";

    if (!request_id || typeof request_id !== "string") {
      return errorResponse("Missing required field: request_id", 400, "INVALID_REQUEST_ID");
    }
    if (!image_url) {
      return errorResponse("Missing required field: image_url", 400, "INVALID_INPUT");
    }

    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (mime_type && !allowedMimes.includes(String(mime_type).toLowerCase())) {
      return errorResponse(`Unsupported image MIME type '${mime_type}'`, 400, "UNSUPPORTED_MIME_TYPE");
    }

    const maxSizeBytes = 10 * 1024 * 1024;
    if (file_size_bytes && Number(file_size_bytes) > maxSizeBytes) {
      return errorResponse("Image size exceeds 10MB limit", 400, "IMAGE_SIZE_EXCEEDED");
    }

    const { workspaceId, via } = await resolveAiWorkspace(user.id, workspace_id || null, adminClient);

    const { data: claim, error: claimError } = await adminClient.rpc("claim_community_ai_request", {
      p_user_id: user.id,
      p_module: moduleName,
      p_daily_limit: 5,
      p_request_id: request_id,
      p_via: via,
      p_workspace_id: workspaceId,
    });

    if (claimError) {
      return errorResponse(claimError.message, 400, "CLAIM_FAILED");
    }

    if (!claim.allowed) {
      if (claim.code === "409_in_progress") {
        return errorResponse("Request is currently in progress", 409, "409_IN_PROGRESS");
      }
      if (claim.code === "daily_limit_exceeded") {
        return errorResponse("Daily AI limit of 5 requests reached for system workspace", 429, "DAILY_LIMIT_EXCEEDED");
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

          if (priorError || !priorUsage?.result_json) {
            return errorResponse("Completed image scan has no persisted verdict", 409, "PERSISTED_VERDICT_MISSING");
          }

          return jsonResponse({
            success: true,
            status: "completed",
            reused: true,
            scan_result: priorUsage.result_json,
          });
        }
        if (claim.status === "failed") {
          return errorResponse(`Previous image scan failed: ${claim.error || "Execution failed"}`, 400, "PREVIOUS_REQUEST_FAILED");
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
                  { type: "image_url", image_url: { url: image_url } },
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

      const { error: completeError } = await adminClient
        .from("community_ai_usage")
        .update({
          status: "completed",
          result_json: scanResult,
          completed_at: new Date().toISOString(),
        })
        .eq("id", usageId)
        .eq("status", "reserved");

      if (completeError) {
        throw new Error(`Failed to persist image scan verdict: ${completeError.message}`);
      }

      return jsonResponse({
        success: true,
        status: "completed",
        reused: false,
        scan_result: scanResult,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "AI image scan failed";

      await adminClient
        .from("community_ai_usage")
        .update({
          status: "failed",
          error_message: errorMsg,
        })
        .eq("id", usageId)
        .eq("status", "reserved");

      return errorResponse(errorMsg, 400, "AI_IMAGE_SCAN_FAILED");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 401, "UNAUTHORIZED");
  }
});
