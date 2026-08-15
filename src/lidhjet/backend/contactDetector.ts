/**
 * PULSE AI — LIDHJET NATIVE MODULE
 * SERVER-SIDE CONTACT INFORMATION DETECTOR
 */

export interface ContactDetectionResult {
  hasContact: boolean;
  type?: "phone" | "email" | "messaging_link" | "social_handle";
  match?: string;
}

export function detectContactInformation(text: string): ContactDetectionResult {
  if (!text) return { hasContact: false };

  // 1. Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    return { hasContact: true, type: "email", match: emailMatch[0] };
  }

  // 2. Social / Messaging URLs (whatsapp, telegram, instagram, facebook, viber, signal)
  const linkRegex = /(wa\.me|t\.me|telegram\.me|whatsapp\.com|instagram\.com|facebook\.com|viber\.com)\/[A-Za-z0-9_.-]+/i;
  const linkMatch = text.match(linkRegex);
  if (linkMatch) {
    return { hasContact: true, type: "messaging_link", match: linkMatch[0] };
  }

  // 3. Social Handles
  const handleRegex = /\b(ig|insta|telegram|tg|whatsapp|wa|viber)\s*[:=]\s*@?[A-Za-z0-9_.-]+/i;
  const handleMatch = text.match(handleRegex);
  if (handleMatch) {
    return { hasContact: true, type: "social_handle", match: handleMatch[0] };
  }

  // 4. Phone numbers (e.g. +355691234567, 0691234567, 068 123 4567, +1-800-555-0199)
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch && phoneMatch[0].replace(/\D/g, "").length >= 7) {
    return { hasContact: true, type: "phone", match: phoneMatch[0] };
  }

  return { hasContact: false };
}
