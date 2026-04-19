import {
  Mail,
  MessageSquare,
  Globe,
  Radio,
  Hash,
  Cloud,
  Phone,
  Send,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Youtube,
  Music2,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps channel_registry.id (or icon hint) → Lucide icon component.
 * Used by every accounts UI surface so the icon set stays consistent.
 */
export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  email: Mail,
  telegram: Send,
  whatsapp: Phone,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  twitter: Twitter,
  youtube: Youtube,
  tiktok: Music2,
  discord: MessageSquare,
  slack: Hash,
  bluesky: Cloud,
  mastodon: Globe,
  custom: Radio,
  website_chat: Globe,
  custom_webhook: Radio,
};

export function iconFor(key: string): LucideIcon {
  return CHANNEL_ICONS[key] ?? Radio;
}
