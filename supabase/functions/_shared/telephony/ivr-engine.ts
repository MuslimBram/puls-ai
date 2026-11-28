/**
 * _shared/telephony/ivr-engine.ts
 *
 * Provider-neutral IVR: walks the workspace's ivr_flows graph (built in the
 * IVR Builder) and returns CallAction[] that any provider renderer can turn
 * into TwiML / TeXML / Plivo XML / Vonage NCCO.
 *
 * Same semantics as twilio-inbound-call: greeting, play_message, menu,
 * transfer, voicemail, time_check, hangup, business hours and agent routing.
 * Prompts are spoken in the language/voice configured for the channel.
 */
import type { CallAction, DialTarget } from "./call-actions.ts";

export interface IvrNode {
  id: string;
  type: "greeting" | "menu" | "transfer" | "voicemail" | "time_check" | "play_message" | "hangup" | string;
  label?: string;
  config?: Record<string, unknown>;
}

export interface IvrEdge {
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface IvrFlow {
  nodes: IvrNode[];
  edges: IvrEdge[];
  settings?: Record<string, unknown> | null;
}

export interface VoiceSettings {
  language: string;
  voice?: string;
}

/** Built-in prompts, so callers hear their own language even without a custom IVR. */
export const SYSTEM_PROMPTS: Record<"sq" | "en", Record<string, string>> = {
  sq: {
    welcome: "Faleminderit që na telefonuat.",
    noInput: "Nuk morëm asnjë zgjedhje. Mirupafshim.",
    invalid: "Zgjedhje e pavlefshme. ",
    choose: "Ju lutem zgjidhni një opsion.",
    transferring: "Po ju kalojmë tani. Ju lutem prisni.",
    connecting: "Ju lutem prisni, po ju lidhim me një agjent.",
    noAgents: "Na vjen keq, asnjë agjent nuk është i lirë. Ju lutem lini një mesazh pas sinjalit.",
    voicemail: "Ju lutem lini mesazhin tuaj pas sinjalit.",
    thanksBye: "Faleminderit. Mirupafshim.",
    closed: "Tani jemi të mbyllur. Ju lutem telefononi gjatë orarit të punës ose lini një mesazh.",
    goodbye: "Faleminderit që telefonuat. Mirupafshim.",
  },
  en: {
    welcome: "Thank you for calling.",
    noInput: "We didn't receive any input. Goodbye.",
    invalid: "Invalid selection. ",
    choose: "Please select an option.",
    transferring: "Transferring your call now. Please hold.",
    connecting: "Please hold while we connect you to an agent.",
    noAgents: "Sorry, no agents are available. Please leave a message after the beep.",
    voicemail: "Please leave a message after the beep.",
    thanksBye: "Thank you. Goodbye.",
    closed: "We are currently closed. Please call back during business hours or leave a message.",
    goodbye: "Thank you for calling. Goodbye.",
  },
};

export const promptsFor = (language: string) =>
  String(language).toLowerCase().startsWith("sq") ? SYSTEM_PROMPTS.sq : SYSTEM_PROMPTS.en;

export interface IvrUrls {
  /** URL the provider calls back for the given node (menus post digits here). */
  step: (nodeId: string) => string;
  /** Recording / transcription callback. */
  recording: string;
}

export interface IvrRequest {
  flow: IvrFlow | null;
  nodeId?: string | null;
  digits?: string | null;
  now: Date;
  urls: IvrUrls;
  voice: VoiceSettings;
  /** Dial targets of agents that are online right now (already resolved by the caller). */
  agentTargets: DialTarget[];
  routingStrategy?: "round_robin" | "least_busy" | "ring_all";
  /** Providers without a redirect verb (Vonage) need redirects inlined. */
  inlineRedirects?: boolean;
  callerId?: string;
  holdMusicUrl?: string;
}

const MAX_INLINE_DEPTH = 10;

export function checkBusinessHours(
  settings: Record<string, unknown> | null | undefined,
  now: Date,
  closedFallback: string,
): { isOpen: boolean; message: string } {
  if (!settings?.business_hours) return { isOpen: true, message: "" };
  const hours = settings.business_hours as Record<string, { open?: string; close?: string }>;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = hours[dayNames[now.getUTCDay()]];
  const closedMessage = (settings.closed_message as string) || closedFallback;
  if (!today?.open || !today?.close) return { isOpen: false, message: closedMessage };
  const [oh, om] = today.open.split(":").map(Number);
  const [ch, cm] = today.close.split(":").map(Number);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isOpen = minutes >= oh * 60 + om && minutes < ch * 60 + cm;
  return { isOpen, message: isOpen ? "" : closedMessage };
}

function say(text: string, v: VoiceSettings): CallAction {
  return { kind: "say", text, language: v.language, voice: v.voice };
}

/** Actions to route the caller to an online agent (or voicemail when none is free). */
export function agentRoutingActions(req: IvrRequest): CallAction[] {
  const p = promptsFor(req.voice.language);
  const targets = req.agentTargets;
  if (targets.length === 0) {
    const actions: CallAction[] = [];
    if (req.holdMusicUrl) actions.push({ kind: "play", url: req.holdMusicUrl, loop: 2 });
    actions.push(say(p.noAgents, req.voice), { kind: "record", maxLengthSec: 120, callbackUrl: req.urls.recording, transcribe: true }, { kind: "hangup" });
    return actions;
  }
  const dialTargets = req.routingStrategy === "ring_all" ? targets : [targets[0]];
  return [
    say(p.connecting, req.voice),
    { kind: "dial", targets: dialTargets, timeoutSec: 30, record: true, recordingCallbackUrl: req.urls.recording, callerId: req.callerId },
    say(p.noAgents, req.voice),
    { kind: "record", maxLengthSec: 120, callbackUrl: req.urls.recording, transcribe: true },
    { kind: "hangup" },
  ];
}

function nodeActions(req: IvrRequest, node: IvrNode, isRetry: boolean, depth: number): CallAction[] {
  const flow = req.flow!;
  const v = req.voice;
  const p = promptsFor(v.language);
  const config = node.config ?? {};
  const next = (target: string): CallAction[] => {
    if (req.inlineRedirects && depth < MAX_INLINE_DEPTH) {
      const n = flow.nodes.find((x) => x.id === target);
      if (n) return nodeActions(req, n, false, depth + 1);
    }
    return [{ kind: "redirect", url: req.urls.step(target) }];
  };

  switch (node.type) {
    case "greeting":
    case "play_message": {
      const message = (config.message as string) || p.welcome;
      const audio = config.audio_url as string | undefined;
      const first: CallAction = audio ? { kind: "play", url: audio } : say(message, v);
      const edge = flow.edges.find((e) => e.source === node.id);
      if (edge && flow.nodes.some((n) => n.id === edge.target)) return [first, ...next(edge.target)];
      return [first, { kind: "hangup" }];
    }
    case "menu": {
      const prompt = (config.prompt as string) || p.choose;
      return [
        {
          kind: "gather",
          numDigits: Number(config.num_digits) || 1,
          timeoutSec: Number(config.timeout) || 5,
          actionUrl: req.urls.step(node.id),
          prompt: (isRetry ? p.invalid : "") + prompt,
          language: v.language,
          voice: v.voice,
        },
        say(p.noInput, v),
        { kind: "hangup" },
      ];
    }
    case "transfer": {
      const number = (config.number as string) || "";
      const sip = (config.sip_uri as string) || "";
      if (number || sip) {
        return [
          say(p.transferring, v),
          {
            kind: "dial",
            targets: [number ? { type: "number", value: number } : { type: "sip", value: sip }],
            record: true,
            recordingCallbackUrl: req.urls.recording,
            callerId: req.callerId,
          },
        ];
      }
      return agentRoutingActions(req);
    }
    case "voicemail": {
      const message = (config.message as string) || p.voicemail;
      return [say(message, v), { kind: "record", maxLengthSec: 120, callbackUrl: req.urls.recording, transcribe: true }, say(p.thanksBye, v), { kind: "hangup" }];
    }
    case "time_check": {
      const hours = checkBusinessHours(config, req.now, p.closed);
      const openEdge = flow.edges.find((e) => e.source === node.id && (e.label === "open" || e.condition === "open"));
      const closedEdge = flow.edges.find((e) => e.source === node.id && (e.label === "closed" || e.condition === "closed"));
      const target = hours.isOpen ? openEdge : closedEdge;
      if (target) return next(target.target);
      if (!hours.isOpen) return [say(hours.message, v), { kind: "hangup" }];
      const edge = flow.edges.find((e) => e.source === node.id);
      return edge ? next(edge.target) : [{ kind: "hangup" }];
    }
    case "hangup":
    default:
      return [say((config.message as string) || p.goodbye, v), { kind: "hangup" }];
  }
}

/**
 * Actions for one IVR request.
 *  - No nodeId: start of the call → root node, or business hours + agent routing.
 *  - nodeId + digits on a menu: follow the matching edge, or repeat the menu.
 *  - nodeId without digits: play that node (target of a redirect).
 */
export function buildIvrActions(req: IvrRequest): CallAction[] {
  const p = promptsFor(req.voice.language);
  const flow = req.flow;
  const hasFlow = !!flow && Array.isArray(flow.nodes) && flow.nodes.length > 0;

  if (!req.nodeId) {
    if (hasFlow) {
      const targets = new Set(flow!.edges.map((e) => e.target));
      const root = flow!.nodes.find((n) => !targets.has(n.id)) ?? flow!.nodes[0];
      return nodeActions(req, root, false, 0);
    }
    const hours = checkBusinessHours(flow?.settings ?? null, req.now, p.closed);
    if (!hours.isOpen) {
      return [say(hours.message, req.voice), { kind: "record", maxLengthSec: 120, callbackUrl: req.urls.recording, transcribe: true }, say(p.thanksBye, req.voice), { kind: "hangup" }];
    }
    return agentRoutingActions(req);
  }

  if (!hasFlow) return [say(p.goodbye, req.voice), { kind: "hangup" }];
  const current = flow!.nodes.find((n) => n.id === req.nodeId);
  if (!current) return [say(p.goodbye, req.voice), { kind: "hangup" }];

  if (req.digits && current.type === "menu") {
    const edge = flow!.edges.find((e) => e.source === current.id && (e.condition === req.digits || e.label === req.digits));
    const nextNode = edge ? flow!.nodes.find((n) => n.id === edge.target) : undefined;
    return nextNode ? nodeActions(req, nextNode, false, 0) : nodeActions(req, current, true, 0);
  }
  // A redirect to a node means "play this node" (not the one after it).
  return nodeActions(req, current, false, 0);
}
