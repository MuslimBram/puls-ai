import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertWorkspaceIsolation,
  bookedIsNotRevenue,
  buildBookingRecommendation,
  deriveJourneyIdempotencyKey,
  detectBookingIntentText,
  extractAppointmentId,
  hasExplicitBookingIntent,
  isPublicCaller,
  isValidAi2Reasoning,
  normalizeBookingDetails,
} from "../../../supabase/functions/_shared/golden-journey-contract";

const repoFile = (...parts: string[]) => join(process.cwd(), ...parts);
const source = (...parts: string[]) => readFileSync(repoFile(...parts), "utf-8");

const goldenSrc = () => source("supabase", "functions", "golden-journey", "index.ts");
const contractSrc = () => source("supabase", "functions", "_shared", "golden-journey-contract.ts");
const executorSrc = () => source("supabase", "functions", "_shared", "ai3-executor-contract.ts");
const bookingSrc = () => source("supabase", "functions", "appointment-booking", "index.ts");
const migrationSrc = () => source("supabase", "migrations", "20260822180000_ai5_golden_journey.sql");
const pulseSrc = () => source("supabase", "functions", "pulse-ai", "index.ts");

const validBooking = {
  client_name: "Ada Example",
  date: "2026-09-14",
  time: "10:30",
  appointment_type_id: "type-1",
};

describe("AI-5 booking intent and details", () => {
  it("recognizes explicit English booking intent", () => {
    expect(detectBookingIntentText("I want to book an appointment tomorrow")).toBe(true);
  });

  it("recognizes explicit Albanian booking intent", () => {
    expect(detectBookingIntentText("Dua të rezervoj një takim")).toBe(true);
  });

  it("does not treat unrelated text as booking intent", () => {
    expect(detectBookingIntentText("Show me my monthly analytics")).toBe(false);
  });

  it("accepts explicit structured booking intent", () => {
    expect(hasExplicitBookingIntent({ intent: "create_booking" })).toBe(true);
  });

  it("requires name, valid date and valid time", () => {
    const result = normalizeBookingDetails({ client_name: "", date: "bad", time: "99:99" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toEqual(expect.arrayContaining(["client_name", "date", "time"]));
  });

  it("normalizes a valid booking without inventing optional fields", () => {
    const result = normalizeBookingDetails(validBooking);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.client_name).toBe("Ada Example");
      expect(result.value.client_email).toBeUndefined();
      expect(result.value.client_phone).toBeUndefined();
    }
  });

  it("rejects impossible calendar dates", () => {
    expect(normalizeBookingDetails({ client_name: "Ada", date: "2026-02-31", time: "10:00" }).ok).toBe(false);
  });

  it("accepts 24-hour HH:mm time", () => {
    expect(normalizeBookingDetails({ client_name: "Ada", date: "2026-09-14", time: "23:59" }).ok).toBe(true);
  });
});

describe("AI-5 AI-2 reasoning contract", () => {
  it("accepts successful AI-2 response with answer", () => {
    expect(isValidAi2Reasoning({ success: true, requestId: "r1", answer: "Booking is appropriate." })).toBe(true);
  });

  it("rejects success with no reasoning payload", () => {
    expect(isValidAi2Reasoning({ success: true, requestId: "r1" })).toBe(false);
  });

  it("rejects failed AI-2 response", () => {
    expect(isValidAi2Reasoning({ success: false, requestId: "r1", answer: "x" })).toBe(false);
  });

  it("builds only create_booking recommendation", () => {
    const rec = buildBookingRecommendation({
      booking: validBooking,
      ai2RequestId: "r1",
      ai2Reasoning: "Explicit booking requested",
      contactId: "c1",
    });
    expect(rec.action_type).toBe("create_booking");
    expect(rec.action_payload.contact_id).toBe("c1");
    expect(rec.source_signal).toBe("explicit_booking_intent");
  });

  it("never marks the recommendation auto-approved in contract", () => {
    expect(contractSrc()).not.toContain("auto_executable: true");
  });
});

describe("AI-5 idempotency and semantic success", () => {
  it("derives the same idempotency key for the same journey", () => {
    const args = { workspaceId: "w1", contactId: "c1", booking: validBooking };
    expect(deriveJourneyIdempotencyKey(args)).toBe(deriveJourneyIdempotencyKey(args));
  });

  it("changes idempotency key when appointment time changes", () => {
    const a = deriveJourneyIdempotencyKey({ workspaceId: "w1", contactId: "c1", booking: validBooking });
    const b = deriveJourneyIdempotencyKey({
      workspaceId: "w1",
      contactId: "c1",
      booking: { ...validBooking, time: "11:30" },
    });
    expect(a).not.toBe(b);
  });

  it("requires success=true plus appointment_id", () => {
    expect(extractAppointmentId({ success: true, appointment_id: "a1" })).toBe("a1");
    expect(extractAppointmentId({ success: true })).toBeNull();
    expect(extractAppointmentId({ appointment_id: "a1" })).toBeNull();
  });

  it("BOOKED is not represented as revenue", () => {
    expect(bookedIsNotRevenue("BOOKED")).toBe(true);
  });
});

describe("AI-5 workspace and public isolation helpers", () => {
  it("identifies missing bearer auth as public", () => {
    expect(isPublicCaller(null)).toBe(true);
    expect(isPublicCaller("")).toBe(true);
  });

  it("identifies bearer-authenticated caller as private path", () => {
    expect(isPublicCaller("Bearer jwt-token")).toBe(false);
  });

  it("requires exact workspace match", () => {
    expect(assertWorkspaceIsolation("w1", "w1")).toBe(true);
    expect(assertWorkspaceIsolation("w1", "w2")).toBe(false);
  });
});

describe("AI-5 runtime source boundaries", () => {
  it("uses canonical pulse-ai rather than direct provider endpoints", () => {
    const src = goldenSrc();
    expect(src).toContain('/functions/v1/pulse-ai');
    expect(src).not.toContain("api.openai.com");
    expect(src).not.toContain("api.anthropic.com");
    expect(src).not.toContain("generativelanguage.googleapis.com");
  });

  it("uses an AI-2 workspace use case, not public customer_support", () => {
    const src = goldenSrc();
    expect(src).toContain('use_case: "general_reasoning"');
    expect(src).not.toContain('use_case: "customer_support"');
  });

  it("passes scoped contact/conversation references to Pulse AI", () => {
    const src = goldenSrc();
    expect(src).toContain("contact_id: args.contactId");
    expect(src).toContain("conversation_id: args.conversationId");
  });

  it("requires JWT user identity", () => {
    const src = goldenSrc();
    expect(src).toContain("sb.auth.getUser");
    expect(src).toContain("isPublicCaller(authHeader)");
  });

  it("verifies workspace membership before action creation", () => {
    const src = goldenSrc();
    expect(src).toContain('rpc("is_workspace_member"');
    expect(src).toContain('.eq("owner_id", userId)');
    expect(src.indexOf("requireWorkspaceMember")).toBeLessThan(src.indexOf('.from("ai_suggested_actions")'));
  });

  it("verifies contact with workspace and user scope", () => {
    const src = goldenSrc();
    const start = src.indexOf("async function verifyContactReference");
    const end = src.indexOf("async function verifyConversationReference");
    const block = src.slice(start, end);
    expect(block).toContain('.eq("workspace_id", workspaceId)');
    expect(block).toContain('.eq("user_id", userId)');
  });

  it("verifies conversation with workspace and user scope", () => {
    const src = goldenSrc();
    const start = src.indexOf("async function verifyConversationReference");
    const end = src.indexOf("async function callPulseAI");
    const block = src.slice(start, end);
    expect(block).toContain('.eq("workspace_id", workspaceId)');
    expect(block).toContain('.eq("user_id", userId)');
  });

  it("creates SUGGESTED non-auto-executable AI-3 action", () => {
    const src = goldenSrc();
    expect(src).toContain('action_type: "create_booking"');
    expect(src).toContain('lifecycle_status: "SUGGESTED"');
    expect(src).toContain("auto_executable: false");
    expect(src).toContain("requires_human_approval: true");
  });

  it("does not approve, queue, or execute the action itself", () => {
    const src = goldenSrc();
    expect(src).not.toContain("ai-action-approve");
    expect(src).not.toContain("appointment-booking?action=book");
    expect(src).not.toContain('lifecycle_status: "QUEUED"');
    expect(src).not.toContain('lifecycle_status: "COMPLETED"');
  });

  it("reuses existing action on duplicate idempotency key", () => {
    const src = goldenSrc();
    expect(src).toContain('.eq("idempotency_key", idempotencyKey)');
    expect(src).toContain("idempotent_replay");
  });

  it("creates correlation row only after an AI-3 action exists", () => {
    const src = goldenSrc();
    expect(src.indexOf('.from("ai_suggested_actions")')).toBeLessThan(src.indexOf('.from("ai_golden_journey_runs")'));
  });
});

describe("AI-5 executor hardening", () => {
  it("AI-3 create_booking passes its controlled action id downstream", () => {
    const src = executorSrc();
    const start = src.indexOf('case "create_booking"');
    const block = src.slice(start, src.indexOf("default:", start));
    expect(block).toContain("ai3_action_id: ctx.actionId");
  });

  it("AI-3 still supports only launch_campaign and create_booking", () => {
    const src = executorSrc();
    const supported = src.slice(src.indexOf("AI3_SUPPORTED_EXECUTOR_TYPES"), src.indexOf("AI3_UNSUPPORTED_EXECUTOR_TYPES"));
    expect(supported).toContain('"launch_campaign"');
    expect(supported).toContain('"create_booking"');
    expect(supported).not.toContain('"create_offer"');
    expect(supported).not.toContain('"issue_referral"');
  });

  it("offer/referral executors remain fail-closed", () => {
    const src = executorSrc();
    expect(src).toContain('"create_offer"');
    expect(src).toContain('"issue_referral"');
    expect(src).toContain("UNSUPPORTED_EXECUTOR");
  });

  it("semantic success still requires appointment_id", () => {
    const src = executorSrc();
    expect(src).toContain("responseBody?.success === true");
    expect(src).toContain('typeof responseBody.appointment_id === "string"');
  });
});

describe("AI-5 appointment idempotency", () => {
  it("only trusts ai3_action_id from internal service authentication", () => {
    const src = bookingSrc();
    expect(src).toContain("ai3_action_id && !isTrustedInternal(req)");
    expect(src).toContain("bearer === getServiceKey()");
    expect(src).toContain("internal === configuredInternal");
  });

  it("checks for an existing appointment before creating another", () => {
    const src = bookingSrc();
    expect(src).toContain('.eq("ai3_action_id", ai3_action_id)');
    expect(src).toContain("idempotent_replay: true");
  });

  it("persists ai3_action_id on the actual appointment", () => {
    const src = bookingSrc();
    expect(src).toContain("ai3_action_id: ai3_action_id ?? null");
    expect(src).toContain('source: ai3_action_id ? "ai3_golden_journey" : "online_booking"');
  });

  it("scopes appointment type to the same workspace", () => {
    const src = bookingSrc();
    const start = src.indexOf("if (type_id)");
    const block = src.slice(start, src.indexOf("const duration", start));
    expect(block).toContain('.eq("workspace_id", workspace_id)');
  });
});

describe("AI-5 candidate migration and attribution", () => {
  it("is explicitly candidate-only", () => {
    expect(migrationSrc()).toContain("CANDIDATE MIGRATION — AI-5 Golden Journey");
    expect(migrationSrc()).toContain("DO NOT APPLY TO PRODUCTION");
  });

  it("enforces one appointment per AI-3 action", () => {
    const src = migrationSrc();
    expect(src).toContain("idx_appointments_ai3_action_once");
    expect(src).toContain("UNIQUE (ai3_action_id)");
  });

  it("persists action, correlation, idempotency and appointment linkage", () => {
    const src = migrationSrc();
    for (const field of ["ai3_action_id", "correlation_id", "idempotency_key", "appointment_id"]) {
      expect(src).toContain(field);
    }
  });

  it("marks BOOKED only from a durable appointment trigger", () => {
    const src = migrationSrc();
    expect(src).toContain("ai5_link_booked_appointment");
    expect(src).toContain("outcome = 'BOOKED'");
    expect(src).toContain("appointment_id = NEW.id");
  });

  it("does not write revenue attribution or fake paid/conversion state", () => {
    const src = migrationSrc();
    expect(src).not.toContain("revenue_attribution");
    expect(src).not.toContain("revenue_amount");
    expect(src).not.toContain("outcome = 'PAID'");
    expect(src).not.toContain("outcome = 'CONVERTED'");
  });

  it("does not weaken authenticated writes to the correlation table", () => {
    const src = migrationSrc();
    expect(src).toContain("GRANT SELECT ON public.ai_golden_journey_runs TO authenticated");
    expect(src).not.toContain("GRANT INSERT ON public.ai_golden_journey_runs TO authenticated");
    expect(src).not.toContain("GRANT UPDATE ON public.ai_golden_journey_runs TO authenticated");
  });
});

describe("AI-2 / AI-4 regression boundary", () => {
  it("Pulse AI still uses canonical AI-4 memory facade", () => {
    const src = pulseSrc();
    expect(src).toContain('from "../_shared/pulse-memory-facade.ts"');
    expect(src).toContain("resolveWorkspaceMemory");
  });

  it("Pulse AI public support remains separate from private memory", () => {
    const src = pulseSrc();
    const start = src.indexOf("async function dispatchPublicSupport");
    const end = src.indexOf("// ── Prompt builders", start);
    expect(src.slice(start, end)).not.toContain("resolveWorkspaceMemory");
  });
});
