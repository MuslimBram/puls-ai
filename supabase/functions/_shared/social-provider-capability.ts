/**
 * social-provider-capability.ts — SOCIAL-1E
 *
 * Canonical typed provider capability contract.
 *
 * DESIGN CONTRACT:
 *   - workspace-scoped capability queries only
 *   - capability status comes from repository truth, not assumption
 *   - NOT_VERIFIED is the default for any unproven capability
 *   - no outbound API calls are made here
 *   - this module ONLY classifies; it does not send or schedule anything
 *
 * PROVIDER AUDIT CLASSIFICATION (based on repository inspection 2026-08-22):
 *   meta_ig (Instagram)         → REUSE (instagram-oauth-start, ChannelCapabilityGate)
 *   meta_fb (Facebook Messenger)→ REUSE (same Meta graph oauth flow)
 *   whatsapp                    → NOT VERIFIED (no canonical WhatsApp send path confirmed)
 *   telegram                    → REUSE (telegram-workspace-resolver.ts confirmed)
 *   email                       → REUSE (email-ingest, email_send_queue confirmed)
 *   sms / twilio                → REUSE (twilio-twiml, twilio-workspace-resolver)
 *   voice                       → REUSE (voice-ai-relay)
 *   webchat                     → REUSE (webchat-channel-validator)
 *   discord                     → LEGACY (providers/discord.ts exists, live status unconfirmed)
 *   slack                       → LEGACY (providers/slack.ts exists, live status unconfirmed)
 *   bluesky                     → LEGACY (providers/bluesky.ts exists, live status unconfirmed)
 *   mastodon                    → LEGACY (providers/mastodon.ts exists, live status unconfirmed)
 *
 * CONSENT AUDIT (based on repository inspection 2026-08-22):
 *   global_suppression_list     → REUSE
 *   suppressed_emails           → REUSE
 *   social_engagement_events.consent_classification → REUSE
 *   channel communication preferences               → MISSING (not confirmed)
 *   workspace quiet-hours config                    → MISSING (not confirmed)
 *   per-contact marketing consent record            → MISSING (not confirmed)
 */

export type CapabilityStatus =
  | "LIVE"
  | "BETA"
  | "NOT_VERIFIED"
  | "UNSUPPORTED";

export type RateLimitClass =
  | "standard"
  | "strict"
  | "unknown";

export interface ConversationWindow {
  hours: number;
  resets_on_inbound: boolean;
  description: string;
}

export interface ProviderCapability {
  provider: string;
  channel: string;
  inbound_messaging: CapabilityStatus;
  outbound_reply: CapabilityStatus;
  proactive_outbound: CapabilityStatus;
  comments_support: CapabilityStatus;
  reactions_support: CapabilityStatus;
  webhook_support: CapabilityStatus;
  templates_required: boolean;
  business_verification_required: boolean;
  approved_sender_required: boolean;
  consent_required: boolean;
  opt_out_required: boolean;
  quiet_hours_applicable: boolean;
  rate_limit_class: RateLimitClass;
  conversation_window: ConversationWindow | null;
  human_review_required: boolean;
  overall_status: CapabilityStatus;
  status_note?: string;
}

const PROVIDER_CAPABILITY_REGISTRY: Record<string, ProviderCapability> = {
  meta_ig: {
    provider: "meta_ig",
    channel: "instagram",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "LIVE",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: true,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: { hours: 24, resets_on_inbound: true, description: "Meta Instagram 24h conversation window" },
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "Inbound + reply LIVE via Meta webhook. Proactive outbound NOT_VERIFIED.",
  },
  meta_fb: {
    provider: "meta_fb",
    channel: "facebook_messenger",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "LIVE",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: true,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: { hours: 24, resets_on_inbound: true, description: "Meta Messenger standard 24h messaging window" },
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "Same Meta Graph API oauth flow as meta_ig. Proactive outbound NOT_VERIFIED.",
  },
  whatsapp: {
    provider: "whatsapp",
    channel: "whatsapp",
    inbound_messaging: "NOT_VERIFIED",
    outbound_reply: "NOT_VERIFIED",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "UNSUPPORTED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "NOT_VERIFIED",
    templates_required: true,
    business_verification_required: true,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "strict",
    conversation_window: { hours: 24, resets_on_inbound: true, description: "WhatsApp Business 24h customer service window" },
    human_review_required: true,
    overall_status: "NOT_VERIFIED",
    status_note: "No canonical WhatsApp send path confirmed in repository.",
  },
  telegram: {
    provider: "telegram",
    channel: "telegram",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "NOT_VERIFIED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: null,
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "telegram-workspace-resolver.ts confirmed. Proactive outbound NOT_VERIFIED.",
  },
  email: {
    provider: "email",
    channel: "email",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "LIVE",
    comments_support: "UNSUPPORTED",
    reactions_support: "UNSUPPORTED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: null,
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "email-ingest + email_send_queue confirmed in migrations.",
  },
  sms: {
    provider: "sms",
    channel: "sms",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "LIVE",
    comments_support: "UNSUPPORTED",
    reactions_support: "UNSUPPORTED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: null,
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "Twilio SMS confirmed via twilio-twiml + twilio-workspace-resolver.",
  },
  voice: {
    provider: "voice",
    channel: "voice",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "UNSUPPORTED",
    reactions_support: "UNSUPPORTED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: true,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "standard",
    conversation_window: null,
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "voice-ai-relay confirmed. Proactive outbound calling NOT_VERIFIED.",
  },
  webchat: {
    provider: "webchat",
    channel: "webchat",
    inbound_messaging: "LIVE",
    outbound_reply: "LIVE",
    proactive_outbound: "UNSUPPORTED",
    comments_support: "UNSUPPORTED",
    reactions_support: "UNSUPPORTED",
    webhook_support: "LIVE",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: false,
    quiet_hours_applicable: false,
    rate_limit_class: "standard",
    conversation_window: null,
    human_review_required: false,
    overall_status: "LIVE",
    status_note: "webchat-channel-validator confirmed. First-party only; no proactive outbound.",
  },
  discord: {
    provider: "discord",
    channel: "discord",
    inbound_messaging: "NOT_VERIFIED",
    outbound_reply: "NOT_VERIFIED",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "NOT_VERIFIED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "NOT_VERIFIED",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "unknown",
    conversation_window: null,
    human_review_required: true,
    overall_status: "NOT_VERIFIED",
    status_note: "providers/discord.ts exists but live send path not confirmed.",
  },
  slack: {
    provider: "slack",
    channel: "slack",
    inbound_messaging: "NOT_VERIFIED",
    outbound_reply: "NOT_VERIFIED",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "NOT_VERIFIED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "NOT_VERIFIED",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "unknown",
    conversation_window: null,
    human_review_required: true,
    overall_status: "NOT_VERIFIED",
    status_note: "providers/slack.ts exists but live send path not confirmed.",
  },
  bluesky: {
    provider: "bluesky",
    channel: "bluesky",
    inbound_messaging: "NOT_VERIFIED",
    outbound_reply: "NOT_VERIFIED",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "NOT_VERIFIED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "NOT_VERIFIED",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "unknown",
    conversation_window: null,
    human_review_required: true,
    overall_status: "NOT_VERIFIED",
    status_note: "providers/bluesky.ts exists but live send path not confirmed.",
  },
  mastodon: {
    provider: "mastodon",
    channel: "mastodon",
    inbound_messaging: "NOT_VERIFIED",
    outbound_reply: "NOT_VERIFIED",
    proactive_outbound: "NOT_VERIFIED",
    comments_support: "NOT_VERIFIED",
    reactions_support: "NOT_VERIFIED",
    webhook_support: "NOT_VERIFIED",
    templates_required: false,
    business_verification_required: false,
    approved_sender_required: false,
    consent_required: true,
    opt_out_required: true,
    quiet_hours_applicable: true,
    rate_limit_class: "unknown",
    conversation_window: null,
    human_review_required: true,
    overall_status: "NOT_VERIFIED",
    status_note: "providers/mastodon.ts exists but live send path not confirmed.",
  },
};

export function getProviderCapability(provider: string): ProviderCapability | null {
  return PROVIDER_CAPABILITY_REGISTRY[provider] ?? null;
}

export function listRegisteredProviders(): string[] {
  return Object.keys(PROVIDER_CAPABILITY_REGISTRY);
}

export function canReply(provider: string): boolean {
  const cap = getProviderCapability(provider);
  if (!cap) return false;
  return cap.outbound_reply === "LIVE" || cap.outbound_reply === "BETA";
}

export function canProactiveOutbound(provider: string): boolean {
  const cap = getProviderCapability(provider);
  if (!cap) return false;
  return cap.proactive_outbound === "LIVE" || cap.proactive_outbound === "BETA";
}
