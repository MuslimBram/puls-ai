import { describe, expect, it } from "vitest";
import { renderCallActions, type CallAction } from "../../../supabase/functions/_shared/telephony/call-actions";
import { buildIvrActions, type IvrFlow } from "../../../supabase/functions/_shared/telephony/ivr-engine";
import {
  createVonageJwt,
  defaultVoice,
  generateWebhookToken,
  hangupCall,
  normalizeStatus,
  parseInboundEvent,
  placeCall,
  PROVIDER_CAPABILITIES,
  redirectCall,
  sha256Hex,
  sipTrunkUri,
  verifyPlivoSignatureV2,
  verifyProviderCredentials,
  verifyTelnyxSignature,
  verifyVonageSignedJwt,
  verifyWebhookToken,
  type ProviderConfig,
} from "../../../supabase/functions/_shared/telephony/providers";

const enc = new TextEncoder();
const b64 = (u: ArrayBuffer | Uint8Array) => Buffer.from(u instanceof Uint8Array ? u : new Uint8Array(u)).toString("base64");
const b64url = (u: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof u === "string" ? enc.encode(u) : u instanceof Uint8Array ? u : new Uint8Array(u)).toString("base64url");

const sample: CallAction[] = [
  { kind: "say", text: "Mirë se vini & faleminderit", language: "sq-AL", voice: "Azure.sq-AL-AnilaNeural" },
  { kind: "gather", numDigits: 1, timeoutSec: 5, actionUrl: "https://x/hook?a=1&b=2", prompt: "Shtypni 1", language: "sq-AL" },
  { kind: "dial", targets: [{ type: "number", value: "+355691234567" }, { type: "sip", value: "sip:agent@pbx.al" }], record: true, recordingCallbackUrl: "https://x/rec", callerId: "+35541234567" },
  { kind: "record", maxLengthSec: 120, callbackUrl: "https://x/rec", transcribe: true },
  { kind: "hangup" },
];

describe("markup renderers", () => {
  it("TwiML/TeXML escapes text and URLs", () => {
    const { body, contentType } = renderCallActions(sample, "texml");
    expect(contentType).toBe("application/xml");
    expect(body).toContain('<Say voice="Azure.sq-AL-AnilaNeural" language="sq-AL">Mirë se vini &amp; faleminderit</Say>');
    expect(body).toContain('action="https://x/hook?a=1&amp;b=2"');
    expect(body).toContain("<Number>+355691234567</Number><Sip>sip:agent@pbx.al</Sip>");
    expect(body).toContain('record="record-from-answer-dual"');
    expect(body.endsWith("<Hangup /></Response>")).toBe(true);
  });

  it("TeXML maps a Twilio Client target to SIP, TwiML keeps Client", () => {
    const a: CallAction[] = [{ kind: "dial", targets: [{ type: "client", value: "agent1" }] }];
    expect(renderCallActions(a, "twiml").body).toContain("<Client>agent1</Client>");
    expect(renderCallActions(a, "texml").body).toContain("<Sip>agent1</Sip>");
  });

  it("Plivo XML uses Speak / GetDigits / User", () => {
    const { body } = renderCallActions(sample, "plivo_xml");
    expect(body).toContain('<Speak language="sq-AL" voice="Azure.sq-AL-AnilaNeural">');
    expect(body).toContain('<GetDigits action="https://x/hook?a=1&amp;b=2" method="POST" numDigits="1" timeout="5">');
    expect(body).toContain("<User>sip:agent@pbx.al</User>");
    expect(body).toContain('transcriptionType="auto"');
  });

  it("Vonage NCCO is JSON with talk/input/connect/record", () => {
    const { body, contentType } = renderCallActions(sample, "vonage_ncco");
    expect(contentType).toBe("application/json");
    const ncco = JSON.parse(body);
    expect(ncco.map((x: { action: string }) => x.action)).toEqual(["talk", "talk", "input", "record", "connect", "record"]);
    const connect = ncco.find((x: { action: string }) => x.action === "connect");
    expect(connect.endpoint[0]).toEqual({ type: "phone", number: "355691234567" });
    expect(connect.from).toBe("35541234567");
    expect(ncco.find((x: { action: string }) => x.action === "input").dtmf.maxDigits).toBe(1);
  });
});

const flow: IvrFlow = {
  nodes: [
    { id: "g", type: "greeting", config: { message: "Mirë se vini" } },
    { id: "m", type: "menu", config: { prompt: "1 për shitje, 2 për mbështetje" } },
    { id: "sales", type: "transfer", config: { number: "+355690000001" } },
    { id: "vm", type: "voicemail" },
  ],
  edges: [
    { source: "g", target: "m" },
    { source: "m", target: "sales", condition: "1" },
    { source: "m", target: "vm", condition: "2" },
  ],
};

const urls = { step: (n: string) => `https://h/ivr?node=${n}`, recording: "https://h/rec" };
const voice = { language: "sq-AL", voice: "Azure.sq-AL-AnilaNeural" };
const base = { flow, now: new Date("2026-12-01T10:00:00Z"), urls, voice, agentTargets: [] };

describe("IVR engine", () => {
  it("starts at the root node and redirects to the menu", () => {
    const a = buildIvrActions(base);
    expect(a[0]).toMatchObject({ kind: "say", text: "Mirë se vini", language: "sq-AL" });
    expect(a[1]).toEqual({ kind: "redirect", url: "https://h/ivr?node=m" });
  });

  it("a redirect to the menu plays the MENU (regression: it used to skip it)", () => {
    const a = buildIvrActions({ ...base, nodeId: "m" });
    expect(a[0]).toMatchObject({ kind: "gather", actionUrl: "https://h/ivr?node=m", prompt: "1 për shitje, 2 për mbështetje" });
  });

  it("digits follow the matching edge", () => {
    const a = buildIvrActions({ ...base, nodeId: "m", digits: "1" });
    expect(a[1]).toMatchObject({ kind: "dial", targets: [{ type: "number", value: "+355690000001" }] });
  });

  it("invalid digits repeat the menu with an Albanian retry prompt", () => {
    const a = buildIvrActions({ ...base, nodeId: "m", digits: "9" });
    expect(a[0]).toMatchObject({ kind: "gather", prompt: "Zgjedhje e pavlefshme. 1 për shitje, 2 për mbështetje" });
  });

  it("inlines redirects for providers without a redirect verb (Vonage)", () => {
    const a = buildIvrActions({ ...base, inlineRedirects: true });
    expect(a.some((x) => x.kind === "redirect")).toBe(false);
    expect(a[1]).toMatchObject({ kind: "gather" });
  });

  it("no IVR + no agents → Albanian voicemail", () => {
    const a = buildIvrActions({ ...base, flow: null });
    expect(a[0]).toMatchObject({ kind: "say", text: expect.stringContaining("asnjë agjent") });
    expect(a[1]).toMatchObject({ kind: "record" });
  });

  it("no IVR + online agent SIP → dial the agent", () => {
    const a = buildIvrActions({ ...base, flow: null, agentTargets: [{ type: "sip", value: "sip:101@pbx" }] });
    expect(a[1]).toMatchObject({ kind: "dial", targets: [{ type: "sip", value: "sip:101@pbx" }] });
  });

  it("outside business hours → closed message", () => {
    const closed = { nodes: [], edges: [], settings: { business_hours: { tuesday: { open: "18:00", close: "19:00" } } } };
    const a = buildIvrActions({ ...base, flow: closed });
    expect(a[0]).toMatchObject({ kind: "say", text: expect.stringContaining("mbyllur") });
  });
});

describe("voices and statuses", () => {
  it("Telnyx speaks Albanian natively; others are flagged honestly", () => {
    expect(defaultVoice("telnyx", "sq-AL")).toEqual({ language: "sq-AL", voice: "Azure.sq-AL-AnilaNeural" });
    expect(PROVIDER_CAPABILITIES.telnyx.albanianTts).toBe("native");
    expect(PROVIDER_CAPABILITIES.plivo.albanianTts).toBe("not_verified");
    expect(PROVIDER_CAPABILITIES.twilio.browserSoftphone).toBe(true);
    expect(PROVIDER_CAPABILITIES.telnyx.browserSoftphone).toBe(false);
  });

  it.each([
    ["in-progress", "in_progress"], ["answered", "in_progress"], ["completed", "completed"],
    ["no-answer", "no_answer"], ["unanswered", "no_answer"], ["cancel", "canceled"], ["rejected", "failed"], ["", null],
  ])("%s → %s", (raw, expected) => expect(normalizeStatus(raw)).toBe(expected));

  it("parses provider payloads into one shape", () => {
    const q = new URLSearchParams();
    expect(parseInboundEvent("plivo", { CallUUID: "u1", From: "355", To: "1", Digits: "2", CallStatus: "in-progress" }, q))
      .toMatchObject({ callId: "u1", digits: "2", status: "in_progress" });
    expect(parseInboundEvent("vonage", { uuid: "v1", from: "355", to: "44", dtmf: { digits: "1" }, status: "answered" }, q))
      .toMatchObject({ callId: "v1", digits: "1", status: "in_progress" });
    expect(parseInboundEvent("telnyx", { CallSid: "t1", From: "+355", To: "+1", CallStatus: "completed", CallDuration: "42" }, q))
      .toMatchObject({ callId: "t1", status: "completed", durationSec: 42 });
  });
});

describe("webhook security", () => {
  it("URL token is verified against its stored hash", async () => {
    const token = generateWebhookToken();
    const hash = await sha256Hex(token);
    expect(await verifyWebhookToken(token, hash)).toBe(true);
    expect(await verifyWebhookToken(token + "x", hash)).toBe(false);
    expect(await verifyWebhookToken(null, hash)).toBe(false);
    expect(await verifyWebhookToken(token, undefined)).toBe(false);
  });

  it("Plivo V2 HMAC signature", async () => {
    const key = await crypto.subtle.importKey("raw", enc.encode("tok"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = b64(await crypto.subtle.sign("HMAC", key, enc.encode("https://h/x?y=1" + "nonce1")));
    expect(await verifyPlivoSignatureV2("https://h/x?y=1", "nonce1", sig, "tok")).toBe(true);
    expect(await verifyPlivoSignatureV2("https://h/x?y=2", "nonce1", sig, "tok")).toBe(false);
  });

  it("Vonage signed JWT (HS256 + payload hash)", async () => {
    const body = JSON.stringify({ uuid: "v1" });
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60, payload_hash: await sha256Hex(body) }));
    const key = await crypto.subtle.importKey("raw", enc.encode("sigsecret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = b64url(await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${payload}`)));
    const jwt = `Bearer ${header}.${payload}.${sig}`;
    expect(await verifyVonageSignedJwt(jwt, "sigsecret", body)).toBe(true);
    expect(await verifyVonageSignedJwt(jwt, "sigsecret", body + " ")).toBe(false);
    expect(await verifyVonageSignedJwt(jwt, "wrong", body)).toBe(false);
  });

  it("Telnyx ed25519 signature with timestamp tolerance", async () => {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const pub = b64(await crypto.subtle.exportKey("raw", pair.publicKey));
    const ts = String(Math.floor(Date.now() / 1000));
    const body = "CallSid=1";
    const sig = b64(await crypto.subtle.sign("Ed25519", pair.privateKey, enc.encode(`${ts}|${body}`)));
    expect(await verifyTelnyxSignature(sig, ts, body, pub)).toBe(true);
    expect(await verifyTelnyxSignature(sig, ts, body + "&x=1", pub)).toBe(false);
    expect(await verifyTelnyxSignature(sig, String(Number(ts) - 3600), body, pub)).toBe(false);
  });
});

type Call = { url: string; init?: RequestInit };
const fakeFetch = (response: unknown, status = 200) => {
  const calls: Call[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fn, calls };
};

describe("REST adapters", () => {
  const telnyx: ProviderConfig = { provider: "telnyx", settings: { texml_application_id: "app1", phone_number: "+15550001" }, secrets: { api_key: "KEY" } };
  const plivo: ProviderConfig = { provider: "plivo", settings: { auth_id: "MA1", phone_number: "+15550002" }, secrets: { auth_token: "T" } };
  const input = { to: "+355691234567", from: "+15550001", answerUrl: "https://h/answer", statusUrl: "https://h/status" };

  it("Telnyx: TeXML outbound call, hangup and redirect", async () => {
    const f = fakeFetch({ call_sid: "v3:abc", status: "queued" });
    expect(await placeCall(telnyx, input, f.fn)).toEqual({ ok: true, detail: "queued", callId: "v3:abc" });
    expect(f.calls[0].url).toBe("https://api.telnyx.com/v2/texml/calls/app1");
    expect((f.calls[0].init!.headers as Record<string, string>).Authorization).toBe("Bearer KEY");
    expect(JSON.parse(String(f.calls[0].init!.body))).toMatchObject({ To: "+355691234567", Url: "https://h/answer", StatusCallback: "https://h/status" });
    await hangupCall(telnyx, "v3:abc", f.fn);
    expect(f.calls[1].url).toBe("https://api.telnyx.com/v2/texml/calls/v3%3Aabc/update");
    expect(JSON.parse(String(f.calls[1].init!.body))).toEqual({ Status: "completed" });
    await redirectCall(telnyx, "v3:abc", "https://h/hold", f.fn);
    expect(JSON.parse(String(f.calls[2].init!.body))).toEqual({ Url: "https://h/hold", Method: "POST" });
  });

  it("Plivo: call create returns request id, numbers without +", async () => {
    const f = fakeFetch({ request_uuid: "req-1", message: "call fired" });
    expect(await placeCall(plivo, input, f.fn)).toMatchObject({ ok: true, callId: "req-1" });
    expect(f.calls[0].url).toBe("https://api.plivo.com/v1/Account/MA1/Call/");
    expect(JSON.parse(String(f.calls[0].init!.body))).toMatchObject({ to: "355691234567", from: "15550001", answer_method: "POST" });
  });

  it("Plivo: a 404 hangup falls back to the request id endpoint", async () => {
    const calls: Call[] = [];
    let n = 0;
    const fn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(n++ === 0 ? "{}" : null, { status: n === 1 ? 404 : 204 });
    };
    expect(await hangupCall(plivo, "req-1", fn)).toMatchObject({ ok: true });
    expect(calls[1].url).toBe("https://api.plivo.com/v1/Account/MA1/Request/req-1/");
  });

  it("Vonage: application JWT is RS256 and the call body uses E.164 digits", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"],
    ) as CryptoKeyPair;
    const der = b64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${der}\n-----END PRIVATE KEY-----`;
    const jwt = await createVonageJwt("app-9", pem, 1_800_000_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ application_id: "app-9", iat: 1_800_000_000, exp: 1_800_000_300 });
    expect(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pair.publicKey, Buffer.from(s, "base64url"), enc.encode(`${h}.${p}`))).toBe(true);

    const vonage: ProviderConfig = { provider: "vonage", settings: { application_id: "app-9", api_key: "k", phone_number: "+447700900000" }, secrets: { private_key: pem, api_secret: "s" } };
    const f = fakeFetch({ uuid: "call-1", status: "started" });
    expect(await placeCall(vonage, input, f.fn)).toMatchObject({ ok: true, callId: "call-1" });
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(body.to).toEqual([{ type: "phone", number: "355691234567" }]);
    expect(body.answer_url).toEqual(["https://h/answer"]);
  });

  it("Custom SIP: calls go through the bridge to the operator's SIP trunk", async () => {
    const sip: ProviderConfig = {
      provider: "custom_sip",
      settings: { sip_server: "sip.operator.al", sip_port: "5060", sip_username: "biz", bridge_provider: "telnyx", texml_application_id: "app1", phone_number: "+35541234567" },
      secrets: { api_key: "KEY", sip_password: "pw" },
    };
    expect(sipTrunkUri(sip, "+355 69 123 4567")).toBe("sip:+355691234567@sip.operator.al:5060");
    const f = fakeFetch({ call_sid: "c1" });
    await placeCall(sip, input, f.fn);
    expect(JSON.parse(String(f.calls[0].init!.body))).toMatchObject({ To: "sip:+355691234567@sip.operator.al:5060", SipAuthUsername: "biz", SipAuthPassword: "pw" });
  });

  it("credential verification reports missing fields and provider errors", async () => {
    expect(await verifyProviderCredentials({ provider: "telnyx", settings: {}, secrets: {} }, fakeFetch({}).fn)).toMatchObject({ ok: false });
    const bad = fakeFetch({ errors: [{ detail: "Authentication failed" }] }, 401);
    expect(await verifyProviderCredentials(telnyx, bad.fn)).toEqual({ ok: false, detail: "Telnyx 401: Authentication failed" });
    expect(await verifyProviderCredentials(telnyx, fakeFetch({ data: {} }).fn)).toMatchObject({ ok: true });
  });
});

import { languageInstruction } from "../../../supabase/functions/_shared/voice-language";

describe("AI voice language & Albanian register", () => {
  it("Albanian with Gheg / Tosk / standard register", () => {
    expect(languageInstruction("sq-AL", "gheg")).toMatch(/Albanian.*Gheg/s);
    expect(languageInstruction("sq-AL", "tosk")).toMatch(/Tosk/);
    expect(languageInstruction("sq-AL", "")).toMatch(/standard literary Albanian/);
  });
  it("other languages follow the caller", () => {
    expect(languageInstruction("en-US", "gheg")).toBe("LANGUAGE: Reply in the caller's language; default to en-US.");
  });
});
