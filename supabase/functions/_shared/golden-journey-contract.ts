// AI-5 — Golden Journey pure contract helpers.
//
// AI-5 integrates existing layers only:
// AI-4 memory -> AI-2 reasoning -> AI-3 controlled action -> canonical executor -> factual outcome.
// It never selects a provider, never approves an action, and never fabricates revenue/conversion.

export const GOLDEN_JOURNEY_OUTCOMES = [
  "RECOMMENDED",
  "APPROVED",
  "BOOKED",
  "COMPLETED",
  "FAILED",
] as const;

export type GoldenJourneyOutcome = (typeof GOLDEN_JOURNEY_OUTCOMES)[number];

export const GOLDEN_JOURNEY_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN_WORKSPACE",
  "BOOKING_INTENT_REQUIRED",
  "BOOKING_DETAILS_REQUIRED",
  "REFERENCE_SCOPE_MISMATCH",
  "AI2_REASONING_FAILED",
  "ACTION_CREATE_FAILED",
] as const;

export type GoldenJourneyErrorCode = (typeof GOLDEN_JOURNEY_ERROR_CODES)[number];

export interface GoldenJourneyBookingDetails {
  client_name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  appointment_type_id?: string;
  client_email?: string;
  client_phone?: string;
  notes?: string;
}

export interface GoldenJourneyStartRequest {
  workspace_id: string;
  contact_id?: string;
  conversation_id?: string;
  text?: string;
  intent?: string;
  booking?: Partial<GoldenJourneyBookingDetails>;
  locale?: string;
  request_id?: string;
}

export interface GoldenJourneyRecommendation {
  action_type: "create_booking";
  title: string;
  description: string;
  confidence: number;
  source_signal: "explicit_booking_intent";
  ai2_request_id: string;
  ai2_reasoning: string;
  action_payload: GoldenJourneyBookingDetails & {
    contact_id?: string;
    conversation_id?: string;
  };
}

export interface GoldenJourneyActionLink {
  actionId: string;
  correlationId: string;
  idempotencyKey: string;
}

const BOOKING_INTENT_PATTERNS = [
  /\b(book|booking|appointment|schedule|reserve|reservation|meeting)\b/i,
  /\b(rezervo|rezervim|rezervoj|takim|cakto|termin)\b/i,
];

export function detectBookingIntentText(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  return BOOKING_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasExplicitBookingIntent(input: Pick<GoldenJourneyStartRequest, "intent" | "text">): boolean {
  const explicit = input.intent?.trim().toLowerCase();
  return explicit === "booking" || explicit === "create_booking" || detectBookingIntentText(input.text);
}

function isDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTime(value: string | undefined): boolean {
  return Boolean(value && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

export function normalizeBookingDetails(
  booking: Partial<GoldenJourneyBookingDetails> | undefined,
): { ok: true; value: GoldenJourneyBookingDetails } | { ok: false; missing: string[] } {
  const raw = booking ?? {};
  const clientName = typeof raw.client_name === "string" ? raw.client_name.trim() : "";
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  const time = typeof raw.time === "string" ? raw.time.trim() : "";
  const missing: string[] = [];

  if (!clientName) missing.push("client_name");
  if (!isDate(date)) missing.push("date");
  if (!isTime(time)) missing.push("time");

  if (missing.length) return { ok: false, missing };

  const value: GoldenJourneyBookingDetails = { client_name: clientName, date, time };
  if (typeof raw.appointment_type_id === "string" && raw.appointment_type_id.trim()) {
    value.appointment_type_id = raw.appointment_type_id.trim();
  }
  if (typeof raw.client_email === "string" && raw.client_email.trim()) {
    value.client_email = raw.client_email.trim();
  }
  if (typeof raw.client_phone === "string" && raw.client_phone.trim()) {
    value.client_phone = raw.client_phone.trim();
  }
  if (typeof raw.notes === "string" && raw.notes.trim()) {
    value.notes = raw.notes.trim().slice(0, 2000);
  }
  return { ok: true, value };
}

export function isValidAi2Reasoning(response: unknown): response is {
  success: true;
  requestId: string;
  answer?: string;
  structuredData?: unknown;
  confidence?: number;
} {
  if (!response || typeof response !== "object") return false;
  const value = response as Record<string, unknown>;
  if (value.success !== true || typeof value.requestId !== "string" || !value.requestId) return false;
  const hasAnswer = typeof value.answer === "string" && value.answer.trim().length > 0;
  const hasStructured = value.structuredData !== undefined && value.structuredData !== null;
  return hasAnswer || hasStructured;
}

export function reasoningText(response: {
  answer?: string;
  structuredData?: unknown;
}): string {
  if (typeof response.answer === "string" && response.answer.trim()) {
    return response.answer.trim().slice(0, 4000);
  }
  return JSON.stringify(response.structuredData ?? {}).slice(0, 4000);
}

export function deriveJourneyIdempotencyKey(args: {
  workspaceId: string;
  contactId?: string;
  conversationId?: string;
  booking: GoldenJourneyBookingDetails;
}): string {
  const identity = (args.contactId || args.conversationId || "anonymous-scoped").toLowerCase();
  const type = args.booking.appointment_type_id ?? "default";
  const compact = [args.workspaceId, identity, args.booking.date, args.booking.time, type]
    .join(":")
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, 180);
  return `ai5:booking:${compact}`;
}

export function buildBookingRecommendation(args: {
  booking: GoldenJourneyBookingDetails;
  ai2RequestId: string;
  ai2Reasoning: string;
  confidence?: number;
  contactId?: string;
  conversationId?: string;
}): GoldenJourneyRecommendation {
  const actionPayload: GoldenJourneyRecommendation["action_payload"] = { ...args.booking };
  if (args.contactId) actionPayload.contact_id = args.contactId;
  if (args.conversationId) actionPayload.conversation_id = args.conversationId;

  return {
    action_type: "create_booking",
    title: "Create customer booking",
    description: "Pulse AI identified explicit booking intent. Business approval is required before execution.",
    confidence: Math.max(0, Math.min(1, args.confidence ?? 0.8)),
    source_signal: "explicit_booking_intent",
    ai2_request_id: args.ai2RequestId,
    ai2_reasoning: args.ai2Reasoning,
    action_payload: actionPayload,
  };
}

export function extractAppointmentId(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = response as Record<string, unknown>;
  return value.success === true && typeof value.appointment_id === "string" && value.appointment_id.trim()
    ? value.appointment_id.trim()
    : null;
}

export function isPublicCaller(authHeader: string | null): boolean {
  return !authHeader?.startsWith("Bearer ");
}

export function assertWorkspaceIsolation(expectedWorkspaceId: string, actualWorkspaceId: unknown): boolean {
  return typeof actualWorkspaceId === "string" && actualWorkspaceId === expectedWorkspaceId;
}

export function bookedIsNotRevenue(outcome: GoldenJourneyOutcome): boolean {
  return outcome === "BOOKED";
}
