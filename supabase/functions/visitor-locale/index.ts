import { buildCorsHeaders } from "../_shared/security-headers.ts";

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req, { allowAnyOrigin: true }), "Content-Type": "application/json" },
  });

// R112 P0: automatic visitor locale is derived from the request's IP-country
// signal. Only locales with real translation resources are returned.
// Current functional public/app resources: en, sq.
const countryToLocale = (country: string): "en" | "sq" => {
  const code = country.trim().toUpperCase();
  if (code === "AL" || code === "XK") return "sq";
  return "en";
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders(req, { allowAnyOrigin: true }) });
  if (req.method !== "GET") return json(req, { error: "Method not allowed" }, 405);

  // Supabase's edge gateway/Cloudflare layer supplies the requester country.
  // Never return the raw IP to the browser.
  const country = req.headers.get("cf-ipcountry") || "";
  const locale = countryToLocale(country);

  return json(req, { locale, country: country || null });
});
