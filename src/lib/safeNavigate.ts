/**
 * safeNavigate — internal navigation validator
 *
 * Allows only same-origin (internal) navigation targets.
 * Rejects:
 *   - protocol-relative paths  (//evil.com)
 *   - backslash-prefixed paths (\\evil.com, /\evil.com)
 *   - absolute URLs with a scheme (https:, http:, javascript:, data:, …)
 *   - any path that resolves outside window.location.origin
 *
 * Returns the sanitised path (pathname + search + hash) when safe,
 * or null when the input should be rejected.  Fails closed.
 */
export function validateInternalPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Reject anything containing a backslash — covers \\evil.com and /\evil.com
  if (raw.includes("\\")) return null;

  // Reject protocol-relative URLs
  if (raw.startsWith("//")) return null;

  // Reject known dangerous schemes (handles javascript:, data:, http:, https:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/i.test(raw)) return null;

  // At this point the value must start with / to be an internal path
  if (!raw.startsWith("/")) return null;

  // Parse via URL to confirm the resolved origin matches ours
  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.origin !== window.location.origin) return null;
    // Return only pathname + search + hash — strip any origin the parser may have added
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return null;
  }
}

/**
 * Wraps useNavigate's `navigate` so it only fires for validated internal paths.
 * Returns a boolean indicating whether navigation was performed.
 */
export function safeNavigate(
  navigate: (to: string, options?: Record<string, unknown>) => void,
  raw: string | null | undefined,
): boolean {
  const safe = validateInternalPath(raw);
  if (safe === null) return false;
  navigate(safe);
  return true;
}
