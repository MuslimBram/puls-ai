// AI-5 Golden Journey runtime
//
// Authenticated workspace path only:
// explicit booking intent -> AI-2 reasoning (which uses AI-4 memory) -> AI-3 SUGGESTED action.
// This function NEVER approves, queues, executes, or records revenue/conversion.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getServiceKey } from "../_shared/admin-client.ts";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import {
  buildBookingRecommendation,
  deriveJourneyIdempotencyKey,
  hasExplicitBookingIntent,
  isPublicCaller,
  isValidAi2Reasoning,
  normalizeBookingDetails,
  reasoningText,
  type GoldenJourneyStartRequest,
} from "../_shared/golden-journey-contract.ts";

const cors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), "Content-Type": "application/json" },
});

const SVC = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  getServiceKey()!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function requireWorkspaceMember(sb: ReturnType<typeof SVC>, userId: string, workspaceId: string): Promise<boolean> {
  const [{ data: member }, { data: owner }] = await Promise.all([
    sb.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
    sb.from("workspaces").select("id").eq("id", workspaceId).eq("owner_id", userId).maybeSingle(),
  ]);
  return Boolean(member || owner);
}

async function verifyContactReference(
  sb: ReturnType<typeof SVC>,
  userId: string,
  workspaceId: string,
  contactId: string,
): Promise<boolean> {
  let { data, error } = await sb.from("enriched_contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("id", contactId)
    .maybeSingle();
  if (!error && data) return true;

  ({ data, error } = await sb.from("enriched_contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("contact_identifier", contactId)
    .maybeSingle());
  if (!error && data) return true;

  const { data: memory, error: memoryError } = await sb.from("ai_conversation_memory")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_identifier", contactId)
    .limit(1);
  return !memoryError && Boolean(memory?.length);
}

async function verifyConversationReference(
  sb: ReturnType<typeof SVC>,
  userId: string,
  workspaceId: string,
  conversationId: string,
): Promise<boolean> {
  const { data, error } = await sb.from("conversation_threads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("id", conversationId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function callPulseAI(args: {
  authHeader: string;
  requestId: string;
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  locale?: string;
  customerText?: string;
  booking: { client_name: string; date: string; time: string; appointment_type_id?: string };
}): Promise<Record<string, unknown> | null> {
  const prompt = [
    "The customer has explicitly requested a booking/appointment.",
    "Assess whether create_booking is the appropriate next controlled action.",
    "Use workspace memory only as evidence. Do not invent customer identity, date, time, price, discount, or payment status.",
    args.customerText ? `Customer request: ${args.customerText.slice(0, 1200)}` : "",
  ].filter(Boolean).join("\n");

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pulse-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: args.authHeader,
    },
    body: JSON.stringify({
      request_id: args.requestId,
      use_case: "general_reasoning",
      workspace_id: args.workspaceId,
      source: "api",
      contact_id: args.contactId,
      conversation_id: args.conversationId,
      locale: args.locale,
      input: {
        text: prompt,
        structured: {
          requested_action: "create_booking",
          requested_date: args.booking.date,
          requested_time: args.booking.time,
          appointment_type_id: args.booking.appointment_type_id ?? null,
        },
      },
    }),
  });

  if (!res.ok) return null;
  return await res.json().catch(() => null) as Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("authorization");
  // AI-5 is a private workspace flow. Public Pulse AI cannot start it.
  if (isPublicCaller(authHeader)) {
    return json(req, { success: false, error_code: "UNAUTHORIZED" }, 401);
  }

  let body: GoldenJourneyStartRequest;
  try {
    body = await req.json();
  } catch {
    return json(req, { success: false, error_code: "BOOKING_DETAILS_REQUIRED" }, 400);
  }

  const workspaceId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  if (!workspaceId) return json(req, { success: false, error_code: "FORBIDDEN_WORKSPACE" }, 403);

  if (!hasExplicitBookingIntent(body)) {
    return json(req, { success: false, error_code: "BOOKING_INTENT_REQUIRED" }, 400);
  }

  const normalizedBooking = normalizeBookingDetails(body.booking);
  if (!normalizedBooking.ok) {
    return json(req, {
      success: false,
      error_code: "BOOKING_DETAILS_REQUIRED",
      missing: normalizedBooking.missing,
    }, 400);
  }

  const sb = SVC();
  const { data: { user }, error: userError } = await sb.auth.getUser(authHeader!.slice(7));
  if (userError || !user) return json(req, { success: false, error_code: "UNAUTHORIZED" }, 401);

  if (!(await requireWorkspaceMember(sb, user.id, workspaceId))) {
    return json(req, { success: false, error_code: "FORBIDDEN_WORKSPACE" }, 403);
  }

  const contactId = typeof body.contact_id === "string" && body.contact_id.trim() ? body.contact_id.trim() : undefined;
  const conversationId = typeof body.conversation_id === "string" && body.conversation_id.trim()
    ? body.conversation_id.trim()
    : undefined;

  if (contactId && !(await verifyContactReference(sb, user.id, workspaceId, contactId))) {
    return json(req, { success: false, error_code: "REFERENCE_SCOPE_MISMATCH" }, 403);
  }
  if (conversationId && !(await verifyConversationReference(sb, user.id, workspaceId, conversationId))) {
    return json(req, { success: false, error_code: "REFERENCE_SCOPE_MISMATCH" }, 403);
  }

  const requestId = typeof body.request_id === "string" && body.request_id.trim()
    ? body.request_id.trim()
    : crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  const ai2Response = await callPulseAI({
    authHeader: authHeader!,
    requestId,
    workspaceId,
    contactId,
    conversationId,
    locale: body.locale,
    customerText: body.text,
    booking: normalizedBooking.value,
  });

  if (!isValidAi2Reasoning(ai2Response)) {
    return json(req, { success: false, error_code: "AI2_REASONING_FAILED" }, 502);
  }

  const recommendation = buildBookingRecommendation({
    booking: normalizedBooking.value,
    ai2RequestId: ai2Response.requestId,
    ai2Reasoning: reasoningText(ai2Response),
    confidence: typeof ai2Response.confidence === "number" ? ai2Response.confidence : undefined,
    contactId,
    conversationId,
  });

  const idempotencyKey = deriveJourneyIdempotencyKey({
    workspaceId,
    contactId,
    conversationId,
    booking: normalizedBooking.value,
  });

  const insertPayload = {
    workspace_id: workspaceId,
    user_id: user.id,
    action_type: "create_booking",
    title: recommendation.title,
    description: recommendation.description,
    confidence: recommendation.confidence,
    impact_estimate: "Medium",
    auto_executable: false,
    status: "pending",
    action_payload: recommendation.action_payload,
    source_signal: recommendation.source_signal,
    lifecycle_status: "SUGGESTED",
    idempotency_key: idempotencyKey,
    original_payload: recommendation.action_payload,
    suggested_by: "ai5_golden_journey",
    correlation_id: correlationId,
  };

  let { data: action, error: actionError } = await sb.from("ai_suggested_actions")
    .insert(insertPayload)
    .select("id,workspace_id,lifecycle_status,correlation_id,idempotency_key")
    .single();

  // Idempotent replay: if the unique key already exists, reuse the existing action.
  if (actionError) {
    const existing = await sb.from("ai_suggested_actions")
      .select("id,workspace_id,lifecycle_status,correlation_id,idempotency_key")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing.error || !existing.data) {
      return json(req, { success: false, error_code: "ACTION_CREATE_FAILED" }, 500);
    }
    action = existing.data;
  }

  if (action.workspace_id !== workspaceId) {
    return json(req, { success: false, error_code: "FORBIDDEN_WORKSPACE" }, 403);
  }

  const { error: runError } = await sb.from("ai_golden_journey_runs").upsert({
    workspace_id: workspaceId,
    user_id: user.id,
    contact_ref: contactId ?? null,
    conversation_id: conversationId ?? null,
    ai2_request_id: ai2Response.requestId,
    ai3_action_id: action.id,
    correlation_id: action.correlation_id,
    idempotency_key: idempotencyKey,
    outcome: action.lifecycle_status === "COMPLETED" ? "COMPLETED" : "RECOMMENDED",
    updated_at: new Date().toISOString(),
  }, { onConflict: "ai3_action_id" });

  if (runError) {
    // The controlled action is still valid and auditable in AI-3, but AI-5 must not
    // pretend the complete Golden Journey correlation was established.
    return json(req, { success: false, error_code: "ACTION_CREATE_FAILED", action_id: action.id }, 500);
  }

  return json(req, {
    success: true,
    outcome: "RECOMMENDED",
    ai2_request_id: ai2Response.requestId,
    action_id: action.id,
    correlation_id: action.correlation_id,
    lifecycle_status: action.lifecycle_status,
    requires_human_approval: true,
    idempotent_replay: Boolean(actionError),
  });
});
