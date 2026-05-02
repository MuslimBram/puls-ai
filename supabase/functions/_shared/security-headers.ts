/**
 * Shared security + CORS headers for all edge functions.
 *
 * CORS policy:
 *  - Production custom domains: alfis.re, kohablerjeve.top (+ www)
 *  - Lovable preview + published: pulsi.lovable.app + *.lovable.app
 *  - Local dev: http://localhost:* and http://127.0.0.1:*
 *  - Public webhooks (PayPal/Meta/integration) MUST set `allowAnyOrigin: true`
 *    when calling buildCorsHeaders, since they are invoked by 3rd-party servers.
 */

const ALLOWED_ORIGINS = new Set<string>([
  "https://alfis.re",
  "https://www.alfis.re",
  "https://kohablerjeve.top",
  "https://www.kohablerjeve.top",
  "https://pulsi.lovable.app",
]);

const ALLOWED_SUFFIXES = [
  ".lovable.app",
  ".lovable.dev",
];

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    if (u.protocol === "https:" && ALLOWED_SUFFIXES.some((s) => u.hostname.endsWith(s))) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export function buildCorsHeaders(
  req: Request,
  options: { allowAnyOrigin?: boolean } = {},
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string;
  if (options.allowAnyOrigin) {
    allowOrigin = "*";
  } else if (isOriginAllowed(origin)) {
    allowOrigin = origin;
  } else {
    // Safe default: first production domain — blocks the browser request
    // when origin isn't allowed (browser will reject mismatch).
    allowOrigin = "https://alfis.re";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Vary": "Origin",
  };
}

/**
 * Legacy export. Kept for backwards compatibility with functions still
 * importing the static object. Returns restrictive defaults (no wildcard).
 * Prefer buildCorsHeaders(req) for new code.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://alfis.re",
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  "Vary": "Origin",
};

/** Combined headers for JSON responses (legacy). */
export const jsonResponseHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

/** Safe OPTIONS preflight handler with dynamic origin. */
export function handleCors(
  req: Request,
  options: { allowAnyOrigin?: boolean } = {},
): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { ...buildCorsHeaders(req, options), ...securityHeaders },
    });
  }
  return null;
}
