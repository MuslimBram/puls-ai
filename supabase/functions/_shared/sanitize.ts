/**
 * Input sanitization utilities for edge functions.
 * Prevents XSS, SQL injection, and other injection attacks.
 */

/** Strip HTML tags to prevent XSS */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/** Escape HTML entities */
export function escapeHtml(input: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
    "`": "&#96;",
  };
  return input.replace(/[&<>"'`/]/g, (c) => map[c] || c);
}

/** Validate and sanitize email format */
export function sanitizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  return emailRegex.test(trimmed) ? trimmed : null;
}

/** Sanitize a generic text input (strip dangerous chars, limit length) */
export function sanitizeText(input: string, maxLength = 5000): string {
  return stripHtml(input).substring(0, maxLength).trim();
}

/** Validate UUID format */
export function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Sanitize URL (only allow http/https) */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/** Detect common SQL injection patterns */
export function hasSqlInjection(input: string): boolean {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION|TRUNCATE)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/i,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /'(\s*)(OR|AND)(\s*)'/i,
  ];
  return patterns.some((p) => p.test(input));
}

/** Full sanitization pipeline for user input */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== "string") return "";
  return sanitizeText(input);
}
