/**
 * Shared security + CORS headers for all edge functions.
 *
 * CORS policy:
 *  - Production custom domains: alfis.re, kohablerjeve.top, pulse-bos.com (+ www)
 *  - Optional first-party LEAH app origins from LEAH_APP_ORIGINS (comma-separated HTTPS origins)
 *  - Local dev: http://localhost:* and http://127.0.0.1:*
 *  - Public webhooks MUST explicitly set allowAnyOrigin: true.
 */

const ALLOWED_ORIGINS = new Set<string>([
  "https://alfis.re",
  "https://www.alfis.re",
  "https://kohablerjeve.top",
  "https://www.kohablerjeve.top",
  "https://pulse-bos.com",
  "https://www.pulse-bos.com",
]);

function configuredLeahOrigins(): Set<string> {
  const result = new Set<string>();
  const raw = Deno.env.get("LEAH_APP_ORIGINS")?.trim() ?? "";
  if (!raw) return result;

  for (const item of raw.split(",")) {
    const value = item.trim();
    if (!value) continue;
    try {
      const u = new URL(value);
      if (
        u.protocol !== "https:" ||
        u.username || u.password ||
        u.pathname !== "/" || u.search || u.hash ||
        u.origin !== value.replace(/\/$/, "")
      ) continue;
      result.add(u.origin);
    } catch {
      // Invalid configured origins are ignored fail-closed.
    }
  }
  return result;
}

function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (configuredLeahOrigins().has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

const CORS_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-leah-session";

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
    // Safe mismatch causes browsers to block unauthorized origins.
    allowOrigin = "https://alfis.re";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Vary": "Origin",
  };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "https://alfis.re",
  "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  "Vary": "Origin",
};

export const jsonResponseHeaders = {
  ...corsHeaders,
  ...securityHeaders,
  "Content-Type": "application/json",
};

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
