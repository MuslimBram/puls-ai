import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Broadcast Unsubscribe Handler
 * 
 * GET  ?token=xxx           → renders unsubscribe confirmation page
 * POST { token, reason? }   → processes the unsubscribe
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // GET: Show unsubscribe confirmation page
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return new Response(renderPage("Invalid Link", "This unsubscribe link is invalid or expired."), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Validate token
      const { data: tokenData } = await supabase
        .from("broadcast_unsubscribe_tokens")
        .select("id, contact_identifier, channel_type, used_at")
        .eq("token", token)
        .maybeSingle();

      if (!tokenData) {
        return new Response(renderPage("Invalid Link", "This unsubscribe link is invalid or expired."), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (tokenData.used_at) {
        return new Response(renderPage("Already Unsubscribed", "You have already been unsubscribed from these messages."), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const maskedContact = maskContact(tokenData.contact_identifier);
      return new Response(renderConfirmPage(token, maskedContact, tokenData.channel_type), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // POST: Process unsubscribe
    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      let token: string | null = null;
      let reason: string | null = null;

      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        token = formData.get("token") as string;
        reason = formData.get("reason") as string;
      } else {
        const body = await req.json();
        token = body.token;
        reason = body.reason;
      }

      if (!token) {
        return new Response(JSON.stringify({ error: "Token required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch and validate token
      const { data: tokenData, error: tokenError } = await supabase
        .from("broadcast_unsubscribe_tokens")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (tokenError || !tokenData) {
        return new Response(renderPage("Error", "Invalid or expired unsubscribe token."), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (tokenData.used_at) {
        return new Response(renderPage("Already Unsubscribed", "You have already been unsubscribed."), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Mark token as used
      await supabase
        .from("broadcast_unsubscribe_tokens")
        .update({ used_at: new Date().toISOString() } as any)
        .eq("id", tokenData.id);

      // Add to optout list
      await supabase.from("broadcast_optouts").insert({
        user_id: tokenData.user_id,
        workspace_id: tokenData.workspace_id,
        contact_identifier: tokenData.contact_identifier,
        channel_type: tokenData.channel_type,
        reason: reason || "unsubscribe_link",
        opted_out_at: new Date().toISOString(),
      });

      // Also add to global suppression list
      await supabase.from("global_suppression_list").upsert({
        user_id: tokenData.user_id,
        workspace_id: tokenData.workspace_id,
        contact_identifier: tokenData.contact_identifier,
        channel_type: tokenData.channel_type,
        suppression_type: "unsubscribe",
        reason: reason || "unsubscribe_link",
        source: "broadcast",
        source_id: tokenData.broadcast_id || null,
      }, { onConflict: "user_id,contact_identifier,channel_type,suppression_type" });

      // Update broadcast unsubscribe count
      if (tokenData.broadcast_id) {
        const { data: broadcast } = await supabase
          .from("broadcasts")
          .select("unsubscribe_count")
          .eq("id", tokenData.broadcast_id)
          .maybeSingle();

        if (broadcast) {
          await supabase
            .from("broadcasts")
            .update({
              unsubscribe_count: (broadcast.unsubscribe_count || 0) + 1,
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", tokenData.broadcast_id);
        }
      }

      console.log(`[UNSUBSCRIBE] ${tokenData.contact_identifier} unsubscribed from ${tokenData.channel_type}`);

      return new Response(
        renderPage(
          "Unsubscribed Successfully",
          `You have been unsubscribed from ${tokenData.channel_type} messages. You will no longer receive broadcast messages on this channel.`
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (e) {
    console.error("[UNSUBSCRIBE] Error:", e);
    return new Response(renderPage("Error", "Something went wrong. Please try again later."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});

function maskContact(contact: string): string {
  if (contact.includes("@")) {
    const [local, domain] = contact.split("@");
    return local.substring(0, 2) + "***@" + domain;
  }
  if (contact.length > 6) {
    return contact.substring(0, 3) + "****" + contact.substring(contact.length - 2);
  }
  return "***";
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{background:#fff;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:1.5rem;margin-bottom:12px;color:#1a1a1a}p{color:#666;line-height:1.6}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

function renderConfirmPage(token: string, maskedContact: string, channelType: string): string {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const actionUrl = `${baseUrl}/functions/v1/broadcast-unsubscribe`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribe</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fa}
.card{background:#fff;border-radius:12px;padding:40px;max-width:480px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:1.5rem;margin-bottom:12px;color:#1a1a1a}p{color:#666;line-height:1.6;margin-bottom:20px}
button{background:#dc2626;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:1rem;cursor:pointer}
button:hover{background:#b91c1c}
select,textarea{width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;font-size:.9rem}
</style></head><body><div class="card">
<h1>Unsubscribe from ${channelType} messages</h1>
<p>You are unsubscribing <strong>${maskedContact}</strong> from future broadcast messages.</p>
<form method="POST" action="${actionUrl}">
<input type="hidden" name="token" value="${token}">
<select name="reason"><option value="">Select a reason (optional)</option>
<option value="too_frequent">Too many messages</option>
<option value="not_relevant">Not relevant to me</option>
<option value="never_subscribed">I never subscribed</option>
<option value="other">Other</option></select>
<button type="submit">Confirm Unsubscribe</button>
</form></div></body></html>`;
}
