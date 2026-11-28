/**
 * _shared/telephony/call-actions.ts
 *
 * Provider-neutral call-control actions and the renderers that turn them into
 * each provider's markup:
 *
 *   Twilio  → TwiML
 *   Telnyx  → TeXML (TwiML-compatible verbs)
 *   Plivo   → Plivo XML
 *   Vonage  → NCCO (JSON)
 *
 * Pure TypeScript (no Deno APIs) so the same code is unit-tested in Vitest.
 */

export type DialTarget =
  | { type: "number"; value: string }
  | { type: "sip"; value: string; username?: string; password?: string }
  | { type: "client"; value: string };

export type CallAction =
  | { kind: "say"; text: string; language?: string; voice?: string }
  | { kind: "play"; url: string; loop?: number }
  | { kind: "gather"; numDigits: number; timeoutSec: number; actionUrl: string; prompt: string; language?: string; voice?: string }
  | { kind: "dial"; targets: DialTarget[]; timeoutSec?: number; record?: boolean; recordingCallbackUrl?: string; callerId?: string }
  | { kind: "record"; maxLengthSec: number; callbackUrl: string; transcribe?: boolean }
  | { kind: "redirect"; url: string }
  | { kind: "pause"; seconds: number }
  | { kind: "hangup" };

export type MarkupFormat = "twiml" | "texml" | "plivo_xml" | "vonage_ncco";

export interface RenderedMarkup {
  body: string;
  contentType: string;
}

export function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const attr = (name: string, value: string | number | boolean | undefined) =>
  value === undefined || value === "" ? "" : ` ${name}="${escapeXml(String(value))}"`;

// ── TwiML / TeXML ────────────────────────────────────────────────────────────

function sayTwiml(text: string, language?: string, voice?: string) {
  return `<Say${attr("voice", voice)}${attr("language", language)}>${escapeXml(text)}</Say>`;
}

function renderTwimlLike(actions: CallAction[], flavor: "twiml" | "texml"): string {
  const out: string[] = [];
  for (const a of actions) {
    switch (a.kind) {
      case "say":
        out.push(sayTwiml(a.text, a.language, a.voice));
        break;
      case "play":
        out.push(`<Play${attr("loop", a.loop)}>${escapeXml(a.url)}</Play>`);
        break;
      case "gather":
        out.push(
          `<Gather input="dtmf"${attr("numDigits", a.numDigits)}${attr("timeout", a.timeoutSec)}${attr("action", a.actionUrl)} method="POST">` +
            sayTwiml(a.prompt, a.language, a.voice) +
            `</Gather>`,
        );
        break;
      case "dial": {
        const inner = a.targets.map((t) => {
          if (t.type === "number") return `<Number>${escapeXml(t.value)}</Number>`;
          if (t.type === "sip") return `<Sip${attr("username", t.username)}${attr("password", t.password)}>${escapeXml(t.value)}</Sip>`;
          // Telnyx has no Twilio "Client"; it is mapped to a SIP credential user.
          return flavor === "twiml" ? `<Client>${escapeXml(t.value)}</Client>` : `<Sip>${escapeXml(t.value)}</Sip>`;
        }).join("");
        const rec = a.record
          ? `${attr("record", "record-from-answer-dual")}${attr("recordingStatusCallback", a.recordingCallbackUrl)}${a.recordingCallbackUrl ? ' recordingStatusCallbackMethod="POST"' : ""}`
          : "";
        out.push(`<Dial${attr("timeout", a.timeoutSec)}${attr("callerId", a.callerId)}${rec}>${inner}</Dial>`);
        break;
      }
      case "record":
        out.push(
          `<Record${attr("maxLength", a.maxLengthSec)}${attr("action", a.callbackUrl)}${attr("recordingStatusCallback", a.callbackUrl)}` +
            `${a.transcribe ? `${attr("transcribe", "true")}${attr("transcribeCallback", a.callbackUrl)}` : ""} />`,
        );
        break;
      case "redirect":
        out.push(`<Redirect method="POST">${escapeXml(a.url)}</Redirect>`);
        break;
      case "pause":
        out.push(`<Pause${attr("length", a.seconds)} />`);
        break;
      case "hangup":
        out.push(`<Hangup />`);
        break;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${out.join("")}</Response>`;
}

// ── Plivo XML ────────────────────────────────────────────────────────────────

function speakPlivo(text: string, language?: string, voice?: string) {
  return `<Speak${attr("language", language)}${attr("voice", voice)}>${escapeXml(text)}</Speak>`;
}

function renderPlivoXml(actions: CallAction[]): string {
  const out: string[] = [];
  for (const a of actions) {
    switch (a.kind) {
      case "say":
        out.push(speakPlivo(a.text, a.language, a.voice));
        break;
      case "play":
        out.push(`<Play${attr("loop", a.loop)}>${escapeXml(a.url)}</Play>`);
        break;
      case "gather":
        out.push(
          `<GetDigits${attr("action", a.actionUrl)} method="POST"${attr("numDigits", a.numDigits)}${attr("timeout", a.timeoutSec)}>` +
            speakPlivo(a.prompt, a.language, a.voice) +
            `</GetDigits>`,
        );
        break;
      case "dial": {
        const inner = a.targets.map((t) =>
          t.type === "number" ? `<Number>${escapeXml(t.value)}</Number>` : `<User>${escapeXml(t.value.startsWith("sip:") ? t.value : `sip:${t.value}`)}</User>`,
        ).join("");
        const rec = a.record && a.recordingCallbackUrl
          ? `${attr("callbackUrl", a.recordingCallbackUrl)} callbackMethod="POST"`
          : "";
        out.push(`<Dial${attr("timeout", a.timeoutSec)}${attr("callerId", a.callerId)}${rec}>${inner}</Dial>`);
        break;
      }
      case "record":
        out.push(
          `<Record${attr("action", a.callbackUrl)} method="POST"${attr("maxLength", a.maxLengthSec)}` +
            `${a.transcribe ? ` transcriptionType="auto"${attr("transcriptionUrl", a.callbackUrl)} transcriptionMethod="POST"` : ""} />`,
        );
        break;
      case "redirect":
        out.push(`<Redirect method="POST">${escapeXml(a.url)}</Redirect>`);
        break;
      case "pause":
        out.push(`<Wait${attr("length", a.seconds)} />`);
        break;
      case "hangup":
        out.push(`<Hangup />`);
        break;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${out.join("")}</Response>`;
}

// ── Vonage NCCO ──────────────────────────────────────────────────────────────

/** Vonage wants E.164 digits without the leading "+". */
export const vonageNumber = (n: string) => String(n).replace(/[^\d]/g, "");

function renderVonageNcco(actions: CallAction[]): string {
  const ncco: Record<string, unknown>[] = [];
  for (const a of actions) {
    switch (a.kind) {
      case "say":
        ncco.push({ action: "talk", text: a.text, ...(a.language ? { language: a.language } : {}) });
        break;
      case "play":
        ncco.push({ action: "stream", streamUrl: [a.url], ...(a.loop ? { loop: a.loop } : {}) });
        break;
      case "gather":
        ncco.push({ action: "talk", text: a.prompt, bargeIn: true, ...(a.language ? { language: a.language } : {}) });
        ncco.push({
          action: "input",
          type: ["dtmf"],
          dtmf: { maxDigits: a.numDigits, timeOut: a.timeoutSec, submitOnHash: true },
          eventUrl: [a.actionUrl],
          eventMethod: "POST",
        });
        break;
      case "dial": {
        const endpoint = a.targets.map((t) =>
          t.type === "number"
            ? { type: "phone", number: vonageNumber(t.value) }
            : { type: "sip", uri: t.value.startsWith("sip:") ? t.value : `sip:${t.value}`, ...(t.type === "sip" && t.username ? { username: t.username, password: t.password } : {}) },
        );
        if (a.record) ncco.push({ action: "record", split: "conversation", channels: 2, ...(a.recordingCallbackUrl ? { eventUrl: [a.recordingCallbackUrl] } : {}) });
        ncco.push({
          action: "connect",
          endpoint,
          ...(a.callerId ? { from: vonageNumber(a.callerId) } : {}),
          ...(a.timeoutSec ? { timeout: a.timeoutSec } : {}),
        });
        break;
      }
      case "record":
        ncco.push({
          action: "record",
          endOnSilence: 5,
          beepStart: true,
          timeOut: a.maxLengthSec,
          eventUrl: [a.callbackUrl],
          ...(a.transcribe ? { transcription: { eventUrl: [a.callbackUrl] } } : {}),
        });
        break;
      case "redirect":
        // NCCO has no redirect verb. The IVR engine inlines redirects for Vonage;
        // anything left is sent as a notify so the event is not lost.
        ncco.push({ action: "notify", payload: { redirect: a.url }, eventUrl: [a.url] });
        break;
      case "pause":
        ncco.push({ action: "talk", text: " ", premium: false });
        break;
      case "hangup":
        // An NCCO ends the call when it runs out of actions.
        break;
    }
  }
  return JSON.stringify(ncco);
}

export function renderCallActions(actions: CallAction[], format: MarkupFormat): RenderedMarkup {
  switch (format) {
    case "twiml":
      return { body: renderTwimlLike(actions, "twiml"), contentType: "application/xml" };
    case "texml":
      return { body: renderTwimlLike(actions, "texml"), contentType: "application/xml" };
    case "plivo_xml":
      return { body: renderPlivoXml(actions), contentType: "application/xml" };
    case "vonage_ncco":
      return { body: renderVonageNcco(actions), contentType: "application/json" };
  }
}
