import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireInternalSecret } from "../_shared/cron-auth.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  // This legacy endpoint previously accepted caller-supplied user_id/channel_id
  // and had no canonical provider event id. Keep it fail-closed until a real
  // provider-authenticated forwarding contract is implemented. The supported
  // inbound Email path is email-poll with server-side channel/workspace binding.
  const unauth = requireInternalSecret(req);
  if (unauth) {
    return new Response(unauth.body, {
      status: unauth.status,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    error: "Legacy email ingest is retired; use the verified IMAP email channel",
    code: "EMAIL_INGEST_RETIRED",
  }), {
    status: 410,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });
});
