/**
 * _shared/telephony/providers.ts
 *
 * Adapters for the telephony providers Pulse AI can run calls through:
 *
 *   twilio      — existing functions (twilio-*), listed here for capabilities
 *   telnyx      — TeXML REST API + TeXML webhooks (TwiML-compatible markup)
 *   plivo       — Plivo Voice REST API + Plivo XML
 *   vonage      — Vonage Voice API (JWT) + NCCO
 *   custom_sip  — the business's own SIP trunk / local operator, bridged
 *                 through a programmable carrier (Twilio or Telnyx), because
 *                 edge functions cannot terminate SIP/RTP themselves.
 *
 * Network calls use an injected `fetch` so the request shapes are unit tested.
 * Crypto uses WebCrypto (available in Deno and Node).
 */
import type { MarkupFormat } from "./call-actions.ts";
import { vonageNumber } from "./call-actions.ts";

export type ProviderId = "twilio" | "telnyx" | "plivo" | "vonage" | "custom_sip";
export type BridgeProvider = "twilio" | "telnyx";

export interface ProviderConfig {
  provider: ProviderId;
  /** Non-secret values (channels.settings). */
  settings: Record<string, string>;
  /** Decrypted secrets (channels.credentials_encrypted, decrypted server-side). */
  secrets: Record<string, string>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CanonicalCallStatus = "queued" | "ringing" | "in_progress" | "completed" | "busy" | "no_answer" | "failed" | "canceled";

export interface InboundCallEvent {
  callId: string;
  from: string;
  to: string;
  digits: string | null;
  status: CanonicalCallStatus | null;
  recordingUrl: string | null;
  durationSec: number | null;
  requestId: string | null;
}

// ── Capabilities (also shown in the provider comparison UI) ─────────────────

export interface ProviderCapabilities {
  markup: MarkupFormat;
  inboundIvr: boolean;
  outboundCalls: boolean;
  hangup: boolean;
  holdResumeTransfer: boolean;
  recording: boolean;
  browserSoftphone: boolean;
  aiVoiceAgent: boolean;
  albanianTts: "native" | "not_verified" | "via_audio_files";
  webhookSignature: string;
}

export const PROVIDER_CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  twilio: {
    markup: "twiml", inboundIvr: true, outboundCalls: true, hangup: true, holdResumeTransfer: true,
    recording: true, browserSoftphone: true, aiVoiceAgent: true, albanianTts: "via_audio_files",
    webhookSignature: "X-Twilio-Signature (HMAC-SHA1)",
  },
  telnyx: {
    markup: "texml", inboundIvr: true, outboundCalls: true, hangup: true, holdResumeTransfer: true,
    recording: true, browserSoftphone: false, aiVoiceAgent: false, albanianTts: "native",
    webhookSignature: "URL token + telnyx-signature-ed25519",
  },
  plivo: {
    markup: "plivo_xml", inboundIvr: true, outboundCalls: true, hangup: true, holdResumeTransfer: true,
    recording: true, browserSoftphone: false, aiVoiceAgent: false, albanianTts: "not_verified",
    webhookSignature: "URL token + X-Plivo-Signature-V2 (HMAC-SHA256)",
  },
  vonage: {
    markup: "vonage_ncco", inboundIvr: true, outboundCalls: true, hangup: true, holdResumeTransfer: true,
    recording: true, browserSoftphone: false, aiVoiceAgent: false, albanianTts: "not_verified",
    webhookSignature: "URL token + signed JWT (HS256)",
  },
  custom_sip: {
    markup: "texml", inboundIvr: true, outboundCalls: true, hangup: true, holdResumeTransfer: true,
    recording: true, browserSoftphone: false, aiVoiceAgent: false, albanianTts: "not_verified",
    webhookSignature: "Bridge provider signature",
  },
};

/** Default spoken voice per provider for Albanian (sq-AL) callers. */
export function defaultVoice(provider: ProviderId, language: string, bridge?: BridgeProvider): { language: string; voice?: string } {
  const sq = language.toLowerCase().startsWith("sq");
  const effective = provider === "custom_sip" ? (bridge ?? "telnyx") : provider;
  if (sq && effective === "telnyx") return { language: "sq-AL", voice: "Azure.sq-AL-AnilaNeural" };
  if (effective === "twilio") return sq ? { language: "sq-AL" } : { language: language || "en-GB", voice: "Polly.Amy" };
  return { language: language || "en-GB" };
}

// ── Status mapping ───────────────────────────────────────────────────────────

export function normalizeStatus(raw: string | null | undefined): CanonicalCallStatus | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!s) return null;
  if (["queued", "initiated", "started"].includes(s)) return "queued";
  if (["ringing", "ring"].includes(s)) return "ringing";
  if (["in-progress", "answered", "inprogress", "bridged", "machine", "human"].includes(s)) return "in_progress";
  if (["completed", "hangup", "complete"].includes(s)) return "completed";
  if (s === "busy") return "busy";
  if (["no-answer", "noanswer", "unanswered", "timeout"].includes(s)) return "no_answer";
  if (["canceled", "cancelled", "cancel"].includes(s)) return "canceled";
  if (["failed", "rejected", "error"].includes(s)) return "failed";
  return null;
}

// ── Inbound webhook parsing ─────────────────────────────────────────────────

export function parseFormOrJson(rawBody: string, contentType: string): Record<string, unknown> {
  if (!rawBody) return {};
  if (contentType.includes("application/json")) {
    try {
      const v = JSON.parse(rawBody);
      return v && typeof v === "object" ? v as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  const out: Record<string, unknown> = {};
  new URLSearchParams(rawBody).forEach((value, key) => { out[key] = value; });
  return out;
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function parseInboundEvent(provider: ProviderId, fields: Record<string, unknown>, query: URLSearchParams): InboundCallEvent {
  const effective = provider === "custom_sip" ? "telnyx" : provider;
  if (effective === "plivo") {
    return {
      callId: str(fields.CallUUID) || str(fields.RequestUUID),
      from: str(fields.From),
      to: str(fields.To),
      digits: str(fields.Digits) || null,
      status: normalizeStatus(str(fields.CallStatus)),
      recordingUrl: str(fields.RecordUrl) || null,
      durationSec: num(fields.Duration ?? fields.RecordingDuration),
      requestId: str(fields.RequestUUID) || null,
    };
  }
  if (effective === "vonage") {
    const dtmf = fields.dtmf as { digits?: string } | undefined;
    const merged = (k: string) => str(fields[k]) || str(query.get(k));
    return {
      callId: merged("uuid"),
      from: merged("from"),
      to: merged("to"),
      digits: (dtmf?.digits ? String(dtmf.digits) : "") || null,
      status: normalizeStatus(merged("status")),
      recordingUrl: merged("recording_url") || null,
      durationSec: num(fields.duration),
      requestId: merged("conversation_uuid") || null,
    };
  }
  // Telnyx TeXML (TwiML-compatible field names)
  return {
    callId: str(fields.CallSid) || str(fields.CallSidLegacy),
    from: str(fields.From),
    to: str(fields.To),
    digits: str(fields.Digits) || null,
    status: normalizeStatus(str(fields.CallStatus)),
    recordingUrl: str(fields.RecordingUrl) || null,
    durationSec: num(fields.CallDuration ?? fields.RecordingDuration),
    requestId: null,
  };
}

// ── Crypto helpers ───────────────────────────────────────────────────────────

const enc = new TextEncoder();

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = clean + "===".slice((clean.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin);
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (obj: unknown) => b64url(enc.encode(JSON.stringify(obj)));

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(hash: "SHA-256" | "SHA-1", key: string, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(message));
}

export async function sha256Hex(message: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random URL token proving a webhook was configured by the channel owner. */
export function generateWebhookToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export async function verifyWebhookToken(token: string | null, storedHash: string | undefined): Promise<boolean> {
  if (!token || !storedHash) return false;
  return timingSafeEqual(await sha256Hex(token), storedHash);
}

// ── Provider webhook signatures (defence in depth on top of the URL token) ──

/** Plivo V2: base64(HMAC-SHA256(authToken, url + nonce)). */
export async function verifyPlivoSignatureV2(url: string, nonce: string | null, signature: string | null, authToken: string): Promise<boolean> {
  if (!nonce || !signature || !authToken) return false;
  const expected = bytesToB64(await hmac("SHA-256", authToken, url + nonce));
  return timingSafeEqual(expected, signature);
}

/** Vonage signed webhooks: Authorization: Bearer <JWT HS256>, optional payload_hash = sha256(body). */
export async function verifyVonageSignedJwt(authorization: string | null, signatureSecret: string, rawBody: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!authorization || !signatureSecret) return false;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return false;
  let header: { alg?: string };
  let payload: { exp?: number; payload_hash?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64ToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64ToBytes(p)));
  } catch {
    return false;
  }
  if (header.alg !== "HS256") return false;
  const expected = b64url(await hmac("SHA-256", signatureSecret, `${h}.${p}`));
  if (!timingSafeEqual(expected, s)) return false;
  if (payload.exp && payload.exp < nowSec - 60) return false;
  if (payload.payload_hash && rawBody) {
    if (!timingSafeEqual(payload.payload_hash, await sha256Hex(rawBody))) return false;
  }
  return true;
}

/** Telnyx: ed25519 over `${timestamp}|${rawBody}`, public key from the Telnyx portal (base64). */
export async function verifyTelnyxSignature(
  signatureB64: string | null,
  timestamp: string | null,
  rawBody: string,
  publicKeyB64: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureB64 || !timestamp || !publicKeyB64) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  try {
    const key = await crypto.subtle.importKey("raw", b64ToBytes(publicKeyB64) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, b64ToBytes(signatureB64) as BufferSource, enc.encode(`${timestamp}|${rawBody}`));
  } catch {
    return false;
  }
}

// ── Vonage application JWT (RS256) for the Voice API ─────────────────────────

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  return b64ToBytes(body);
}

export async function createVonageJwt(applicationId: string, privateKeyPem: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const jti = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = b64urlJson({ application_id: applicationId, iat: nowSec, exp: nowSec + 300, jti });
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(privateKeyPem) as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

// ── REST adapters ────────────────────────────────────────────────────────────

export interface PlaceCallInput {
  to: string;
  from: string;
  answerUrl: string;
  statusUrl: string;
}

export interface ProviderResult {
  ok: boolean;
  detail: string;
  callId?: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fail(provider: string, res: Response, data: Record<string, unknown>): ProviderResult {
  const errors = data.errors as Array<{ detail?: string; title?: string }> | undefined;
  const msg = errors?.[0]?.detail || errors?.[0]?.title || (data.error as string) || (data.title as string) || (data.message as string) || res.statusText;
  return { ok: false, detail: `${provider} ${res.status}: ${msg || "request failed"}` };
}

const TELNYX = "https://api.telnyx.com/v2";
const PLIVO = "https://api.plivo.com/v1";
const VONAGE = "https://api.nexmo.com";

/** The provider that actually executes calls for this configuration. */
export function executingProvider(cfg: ProviderConfig): Exclude<ProviderId, "custom_sip"> {
  if (cfg.provider !== "custom_sip") return cfg.provider;
  return (cfg.settings.bridge_provider === "twilio" ? "twilio" : "telnyx");
}

/** For custom SIP, a phone number is reached through the business's own SIP trunk. */
export function sipTrunkUri(cfg: ProviderConfig, number: string): string | null {
  if (cfg.provider !== "custom_sip" || !cfg.settings.sip_server) return null;
  const n = String(number).replace(/[^\d+]/g, "");
  const port = cfg.settings.sip_port ? `:${cfg.settings.sip_port}` : "";
  return `sip:${n}@${cfg.settings.sip_server}${port}`;
}

export async function verifyProviderCredentials(cfg: ProviderConfig, fetchImpl: FetchLike): Promise<ProviderResult> {
  const exec = executingProvider(cfg);
  if (cfg.provider === "custom_sip" && !cfg.settings.sip_server) return { ok: false, detail: "SIP server is required" };
  switch (exec) {
    case "telnyx": {
      if (!cfg.secrets.api_key) return { ok: false, detail: "Telnyx API key is required" };
      const res = await fetchImpl(`${TELNYX}/balance`, { headers: { Authorization: `Bearer ${cfg.secrets.api_key}` } });
      const data = await readJson(res);
      if (!res.ok) return fail("Telnyx", res, data);
      if (!cfg.settings.texml_application_id) return { ok: false, detail: "Telnyx TeXML Application ID is required to place calls" };
      return { ok: true, detail: "Telnyx API key verified" };
    }
    case "plivo": {
      const { auth_id } = cfg.settings;
      if (!auth_id || !cfg.secrets.auth_token) return { ok: false, detail: "Plivo Auth ID and Auth Token are required" };
      const res = await fetchImpl(`${PLIVO}/Account/${encodeURIComponent(auth_id)}/`, {
        headers: { Authorization: `Basic ${btoa(`${auth_id}:${cfg.secrets.auth_token}`)}` },
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Plivo", res, data);
      return { ok: true, detail: `Plivo account verified${data.name ? `: ${data.name}` : ""}` };
    }
    case "vonage": {
      const { api_key, application_id } = cfg.settings;
      if (!api_key || !cfg.secrets.api_secret) return { ok: false, detail: "Vonage API key and secret are required" };
      if (!application_id || !cfg.secrets.private_key) return { ok: false, detail: "Vonage Application ID and private key are required for voice" };
      const res = await fetchImpl(`https://rest.nexmo.com/account/get-balance?api_key=${encodeURIComponent(api_key)}&api_secret=${encodeURIComponent(cfg.secrets.api_secret)}`);
      const data = await readJson(res);
      if (!res.ok) return fail("Vonage", res, data);
      try {
        await createVonageJwt(application_id, cfg.secrets.private_key);
      } catch {
        return { ok: false, detail: "Vonage private key is not a valid PKCS#8 PEM key" };
      }
      return { ok: true, detail: "Vonage account and application key verified" };
    }
    case "twilio": {
      const { account_sid } = cfg.settings;
      if (!account_sid || !cfg.secrets.auth_token) return { ok: false, detail: "Twilio Account SID and Auth Token are required" };
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}.json`, {
        headers: { Authorization: `Basic ${btoa(`${account_sid}:${cfg.secrets.auth_token}`)}` },
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Twilio", res, data);
      return { ok: true, detail: `Twilio verified${data.friendly_name ? `: ${data.friendly_name}` : ""}` };
    }
  }
}

export async function placeCall(cfg: ProviderConfig, input: PlaceCallInput, fetchImpl: FetchLike): Promise<ProviderResult> {
  const exec = executingProvider(cfg);
  const to = sipTrunkUri(cfg, input.to) ?? input.to;
  switch (exec) {
    case "telnyx": {
      const res = await fetchImpl(`${TELNYX}/texml/calls/${encodeURIComponent(cfg.settings.texml_application_id ?? "")}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.secrets.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          To: to,
          From: input.from,
          Url: input.answerUrl,
          UrlMethod: "POST",
          StatusCallback: input.statusUrl,
          StatusCallbackMethod: "POST",
          ...(cfg.provider === "custom_sip" && cfg.settings.sip_username
            ? { SipAuthUsername: cfg.settings.sip_username, SipAuthPassword: cfg.secrets.sip_password ?? "" }
            : {}),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Telnyx", res, data);
      const d = (data.data as Record<string, unknown>) ?? data;
      const callId = str(d.call_sid ?? d.sid ?? d.call_control_id);
      return callId ? { ok: true, detail: "queued", callId } : { ok: false, detail: "Telnyx did not return a call id" };
    }
    case "plivo": {
      const { auth_id } = cfg.settings;
      const res = await fetchImpl(`${PLIVO}/Account/${encodeURIComponent(auth_id)}/Call/`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${auth_id}:${cfg.secrets.auth_token}`)}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: input.from.replace(/^\+/, ""),
          to: to.replace(/^\+/, ""),
          answer_url: input.answerUrl,
          answer_method: "POST",
          hangup_url: input.statusUrl,
          hangup_method: "POST",
          ring_url: input.statusUrl,
          ring_method: "POST",
        }),
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Plivo", res, data);
      const callId = str(Array.isArray(data.request_uuid) ? data.request_uuid[0] : data.request_uuid);
      return callId ? { ok: true, detail: "queued", callId } : { ok: false, detail: "Plivo did not return a request id" };
    }
    case "vonage": {
      const jwt = await createVonageJwt(cfg.settings.application_id, cfg.secrets.private_key);
      const res = await fetchImpl(`${VONAGE}/v1/calls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          to: [{ type: "phone", number: vonageNumber(input.to) }],
          from: { type: "phone", number: vonageNumber(input.from) },
          answer_url: [input.answerUrl],
          answer_method: "POST",
          event_url: [input.statusUrl],
          event_method: "POST",
        }),
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Vonage", res, data);
      const callId = str(data.uuid);
      return callId ? { ok: true, detail: str(data.status) || "started", callId } : { ok: false, detail: "Vonage did not return a call uuid" };
    }
    case "twilio": {
      const { account_sid } = cfg.settings;
      const body = new URLSearchParams({
        To: to,
        From: input.from,
        Url: input.answerUrl,
        StatusCallback: input.statusUrl,
        StatusCallbackEvent: "initiated ringing answered completed",
        StatusCallbackMethod: "POST",
      });
      if (cfg.provider === "custom_sip" && cfg.settings.sip_username) {
        body.set("SipAuthUsername", cfg.settings.sip_username);
        body.set("SipAuthPassword", cfg.secrets.sip_password ?? "");
      }
      const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}/Calls.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${account_sid}:${cfg.secrets.auth_token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await readJson(res);
      if (!res.ok) return fail("Twilio", res, data);
      return { ok: true, detail: str(data.status) || "queued", callId: str(data.sid) };
    }
  }
}

export async function hangupCall(cfg: ProviderConfig, callId: string, fetchImpl: FetchLike): Promise<ProviderResult> {
  const exec = executingProvider(cfg);
  let res: Response;
  switch (exec) {
    case "telnyx":
      res = await fetchImpl(`${TELNYX}/texml/calls/${encodeURIComponent(callId)}/update`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.secrets.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ Status: "completed" }),
      });
      break;
    case "plivo": {
      const { auth_id } = cfg.settings;
      res = await fetchImpl(`${PLIVO}/Account/${encodeURIComponent(auth_id)}/Call/${encodeURIComponent(callId)}/`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${btoa(`${auth_id}:${cfg.secrets.auth_token}`)}` },
      });
      // A call that has not been answered yet is addressed by its request id.
      if (res.status === 404) {
        res = await fetchImpl(`${PLIVO}/Account/${encodeURIComponent(auth_id)}/Request/${encodeURIComponent(callId)}/`, {
          method: "DELETE",
          headers: { Authorization: `Basic ${btoa(`${auth_id}:${cfg.secrets.auth_token}`)}` },
        });
      }
      break;
    }
    case "vonage": {
      const jwt = await createVonageJwt(cfg.settings.application_id, cfg.secrets.private_key);
      res = await fetchImpl(`${VONAGE}/v1/calls/${encodeURIComponent(callId)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hangup" }),
      });
      break;
    }
    case "twilio": {
      const { account_sid } = cfg.settings;
      res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}/Calls/${encodeURIComponent(callId)}.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${account_sid}:${cfg.secrets.auth_token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Status: "completed" }),
      });
      break;
    }
  }
  if (res.ok || res.status === 204) return { ok: true, detail: "ended", callId };
  return fail(exec, res, await readJson(res));
}

/** Points a live call at new call-control markup (hold, resume, transfer). */
export async function redirectCall(cfg: ProviderConfig, callId: string, markupUrl: string, fetchImpl: FetchLike): Promise<ProviderResult> {
  const exec = executingProvider(cfg);
  let res: Response;
  switch (exec) {
    case "telnyx":
      res = await fetchImpl(`${TELNYX}/texml/calls/${encodeURIComponent(callId)}/update`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.secrets.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ Url: markupUrl, Method: "POST" }),
      });
      break;
    case "plivo": {
      const { auth_id } = cfg.settings;
      res = await fetchImpl(`${PLIVO}/Account/${encodeURIComponent(auth_id)}/Call/${encodeURIComponent(callId)}/`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${auth_id}:${cfg.secrets.auth_token}`)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ legs: "aleg", aleg_url: markupUrl, aleg_method: "POST" }),
      });
      break;
    }
    case "vonage": {
      const jwt = await createVonageJwt(cfg.settings.application_id, cfg.secrets.private_key);
      res = await fetchImpl(`${VONAGE}/v1/calls/${encodeURIComponent(callId)}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", destination: { type: "ncco", url: [markupUrl] } }),
      });
      break;
    }
    case "twilio": {
      const { account_sid } = cfg.settings;
      res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(account_sid)}/Calls/${encodeURIComponent(callId)}.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${account_sid}:${cfg.secrets.auth_token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ Url: markupUrl, Method: "POST" }),
      });
      break;
    }
  }
  if (res.ok || res.status === 204) return { ok: true, detail: "redirected", callId };
  return fail(exec, res, await readJson(res));
}

/** Which settings are secrets (encrypted at rest, never returned to the browser). */
export const SECRET_FIELDS: Record<ProviderId, string[]> = {
  twilio: ["auth_token", "api_key_secret"],
  telnyx: ["api_key"],
  plivo: ["auth_token"],
  vonage: ["api_secret", "private_key", "signature_secret"],
  custom_sip: ["sip_password", "auth_token", "api_key"],
};

export const REQUIRED_FIELDS: Record<ProviderId, string[]> = {
  twilio: ["account_sid", "auth_token", "phone_number"],
  telnyx: ["api_key", "texml_application_id", "phone_number"],
  plivo: ["auth_id", "auth_token", "phone_number"],
  vonage: ["api_key", "api_secret", "application_id", "private_key", "phone_number"],
  custom_sip: ["sip_server", "phone_number", "bridge_provider"],
};

/** Non-secret fields that may be stored in channels.settings. */
export const SETTINGS_FIELDS: Record<ProviderId, string[]> = {
  twilio: ["account_sid", "phone_number", "twiml_app_sid", "api_key_sid"],
  telnyx: ["texml_application_id", "phone_number", "public_key"],
  plivo: ["auth_id", "phone_number"],
  vonage: ["api_key", "application_id", "phone_number"],
  custom_sip: ["sip_server", "sip_port", "sip_username", "sip_domain", "phone_number", "bridge_provider", "account_sid", "texml_application_id", "public_key"],
};

export const COMMON_SETTINGS_FIELDS = ["voice_language", "voice_dialect", "tts_voice", "agent_forward_number"];
