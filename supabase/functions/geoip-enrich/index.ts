import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  const unauth = requireCronAuth(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { ...getCors(req), "Content-Type": "application/json" } });


  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()!
    );

    // Find security events missing geo data
    const { data: events, error } = await supabase
      .from("security_events")
      .select("id, ip_address")
      .is("country_code", null)
      .not("ip_address", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ enriched: 0 }), { headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    let enriched = 0;
    for (const event of events) {
      try {
        // Use ip-api.com over HTTPS to avoid leaking IPs in plaintext
        const res = await fetch(`https://ip-api.com/json/${event.ip_address}?fields=status,countryCode,city`);

        const geo = await res.json();

        if (geo.status === "success") {
          await supabase
            .from("security_events")
            .update({ country_code: geo.countryCode, geo_city: geo.city })
            .eq("id", event.id);
          enriched++;
        }

        // Rate limit: ~45/min
        if (enriched % 40 === 0) await new Promise((r) => setTimeout(r, 60000));
      } catch {
        // Skip individual failures
      }
    }

    return new Response(JSON.stringify({ enriched, total: events.length }), {
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
