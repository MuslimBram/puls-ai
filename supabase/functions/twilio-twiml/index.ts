import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";

const ALLOW_ANY_ORIGIN = true;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCors(req) });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "outbound";
  const target = url.searchParams.get("target") || "";
  const rawWorkspaceId = url.searchParams.get("workspace_id") || "";
  // Strict UUID validation — reject anything else to prevent XML/TwiML injection
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const workspaceId = UUID_RE.test(rawWorkspaceId) ? rawWorkspaceId : "";

  let twiml = "";

  switch (type) {
    case "outbound":
      // Standard outbound call - connect and enable recording
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Connecting your call. Please wait.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${escapeXml(Deno.env.get("SUPABASE_URL") || "")}/functions/v1/twilio-status-callback?event=recording&amp;workspace_id=${escapeXml(workspaceId)}" recordingStatusCallbackMethod="POST">
  </Dial>
</Response>`;
      break;

    case "inbound":
      // Inbound call - play greeting and queue
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Thank you for calling. Please hold while we connect you to an agent.</Say>
  <Enqueue waitUrl="/hold-music">${escapeXml(workspaceId)}</Enqueue>
</Response>`;
      break;

    case "hold":
      // Hold music / waiting
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">You have been placed on hold. Please wait.</Say>
  <Play loop="0">http://com.twilio.sounds.music.s3.amazonaws.com/oldDog_-_endless_goodbye_%28instr.%29.mp3</Play>
</Response>`;
      break;

    case "transfer":
      // Transfer call to target number
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Transferring your call now.</Say>
  <Dial>
    <Number>${escapeXml(target)}</Number>
  </Dial>
</Response>`;
      break;

    default:
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>An error occurred.</Say>
  <Hangup/>
</Response>`;
  }

  return new Response(twiml, {
    headers: { ...getCors(req), "Content-Type": "application/xml" },
  });
});

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
