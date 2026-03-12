import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Get all email channels with IMAP settings
    const { data: emailChannels, error: chErr } = await supabase
      .from("channels")
      .select("*")
      .eq("channel_type", "email")
      .eq("is_enabled", true)
      .eq("connection_status", "connected");

    if (chErr) throw new Error(`Channel query error: ${chErr.message}`);
    if (!emailChannels || emailChannels.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: "No active email channels" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;

    for (const channel of emailChannels) {
      const settings = channel.settings as Record<string, any> | null;
      if (!settings?.imap_host || !settings?.imap_user || !settings?.imap_password) {
        console.log(`[EMAIL-POLL] Channel ${channel.id} missing IMAP credentials, skipping`);
        continue;
      }

      try {
        // Use Deno's native TCP to connect to IMAP server
        const host = settings.imap_host;
        const port = settings.imap_port || 993;
        const user = settings.imap_user;
        const pass = settings.imap_password;
        const useTls = settings.imap_tls !== false;

        // Connect to IMAP server
        const conn = useTls
          ? await Deno.connectTls({ hostname: host, port })
          : await Deno.connect({ hostname: host, port });

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const readResponse = async (): Promise<string> => {
          const buf = new Uint8Array(8192);
          const n = await conn.read(buf);
          return n ? decoder.decode(buf.subarray(0, n)) : "";
        };

        const sendCommand = async (tag: string, cmd: string): Promise<string> => {
          await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
          let response = "";
          let attempts = 0;
          while (attempts < 10) {
            const chunk = await readResponse();
            response += chunk;
            if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) break;
            attempts++;
          }
          return response;
        };

        // Read greeting
        await readResponse();

        // Login
        const loginResp = await sendCommand("A001", `LOGIN "${user}" "${pass}"`);
        if (!loginResp.includes("A001 OK")) {
          console.error(`[EMAIL-POLL] Login failed for channel ${channel.id}`);
          conn.close();
          continue;
        }

        // Select INBOX
        const selectResp = await sendCommand("A002", "SELECT INBOX");

        // Search for unseen messages
        const searchResp = await sendCommand("A003", "SEARCH UNSEEN");
        const searchMatch = searchResp.match(/\* SEARCH (.+)/);
        const messageIds = searchMatch ? searchMatch[1].trim().split(/\s+/).filter(Boolean) : [];

        if (messageIds.length === 0) {
          await sendCommand("A099", "LOGOUT");
          conn.close();
          continue;
        }

        // Fetch up to 20 newest messages
        const idsToFetch = messageIds.slice(-20);

        for (const msgId of idsToFetch) {
          try {
            const fetchResp = await sendCommand(`F${msgId}`, `FETCH ${msgId} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] BODY[TEXT])`);

            // Parse headers
            const fromMatch = fetchResp.match(/From:\s*(.+)/i);
            const subjectMatch = fetchResp.match(/Subject:\s*(.+)/i);
            const dateMatch = fetchResp.match(/Date:\s*(.+)/i);

            const fromRaw = fromMatch?.[1]?.trim() || "unknown@email.com";
            const subject = subjectMatch?.[1]?.trim() || "(No Subject)";
            const dateStr = dateMatch?.[1]?.trim();

            // Extract email and name from From header
            const emailMatch = fromRaw.match(/<(.+?)>/);
            const fromEmail = emailMatch ? emailMatch[1] : fromRaw;
            const fromName = fromRaw.replace(/<.+>/, "").replace(/"/g, "").trim() || fromEmail;

            // Extract body text (simplified)
            const bodyStart = fetchResp.indexOf("\r\n\r\n", fetchResp.indexOf("BODY[TEXT]"));
            let bodyText = bodyStart > -1 ? fetchResp.substring(bodyStart + 4) : "";
            // Clean up IMAP artifacts
            bodyText = bodyText.replace(/\)\r\n.*$/s, "").trim();
            if (!bodyText) bodyText = subject;

            const messageContent = subject !== "(No Subject)" ? `[${subject}] ${bodyText.substring(0, 2000)}` : bodyText.substring(0, 2000);

            // Keyword matching
            const { data: keywords } = await supabase
              .from("keywords")
              .select("keyword")
              .eq("user_id", channel.user_id)
              .eq("is_active", true);

            const textLower = messageContent.toLowerCase();
            const matched = (keywords || [])
              .filter((k: any) => textLower.includes(k.keyword.toLowerCase()))
              .map((k: any) => k.keyword);

            const intentScore = matched.length > 0 ? 0.5 : 0.1;

            // AI analysis for matched messages
            let aiScore = intentScore;
            let suggestedReply = "";
            if (matched.length > 0) {
              const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
              if (LOVABLE_API_KEY) {
                try {
                  const { data: profile } = await supabase
                    .from("business_profiles")
                    .select("*")
                    .eq("user_id", channel.user_id)
                    .maybeSingle();

                  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${LOVABLE_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      model: "google/gemini-2.5-flash-lite",
                      messages: [
                        {
                          role: "system",
                          content: `Analyze email buying intent for keywords: ${matched.join(", ")}. Business: ${profile?.business_name || "Unknown"}. Respond with JSON: {"intent_score": number 0-1, "suggested_reply": string, "is_lead": boolean}`,
                        },
                        { role: "user", content: messageContent.substring(0, 1000) },
                      ],
                      tools: [{
                        type: "function",
                        function: {
                          name: "analyze_lead",
                          description: "Return analysis",
                          parameters: {
                            type: "object",
                            properties: {
                              intent_score: { type: "number" },
                              suggested_reply: { type: "string" },
                              is_lead: { type: "boolean" },
                            },
                            required: ["intent_score", "suggested_reply", "is_lead"],
                            additionalProperties: false,
                          },
                        },
                      }],
                      tool_choice: { type: "function", function: { name: "analyze_lead" } },
                    }),
                  });
                  if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
                    if (tc) {
                      const parsed = JSON.parse(tc.function.arguments);
                      aiScore = parsed.intent_score;
                      suggestedReply = parsed.suggested_reply;
                    }
                  }
                } catch (e) {
                  console.error("[EMAIL-POLL] AI analysis error:", e);
                }
              }
            }

            // Insert inbox message
            await supabase.from("inbox_messages").insert({
              user_id: channel.user_id,
              channel_id: channel.id,
              channel_type: "email",
              source_name: fromEmail,
              sender_name: fromName,
              sender_identifier: fromEmail,
              message_content: messageContent,
              message_timestamp: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
              intent_score: aiScore,
              matched_keywords: matched,
              is_unread: true,
              priority: aiScore >= 0.7 ? "high" : matched.length > 0 ? "medium" : "normal",
              status: "new",
            });

            // Create lead if matched
            if (matched.length > 0 && aiScore >= 0.3) {
              await supabase.from("leads").insert({
                user_id: channel.user_id,
                message_content: messageContent,
                source_name: fromEmail,
                source_type: "email",
                message_date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(),
                detected_keyword: matched[0],
                intent_score: aiScore,
                suggested_reply: suggestedReply,
                status: "new",
              });

              // Increment leads_used
              const { data: sub } = await supabase
                .from("subscriptions")
                .select("leads_used")
                .eq("user_id", channel.user_id)
                .maybeSingle();

              if (sub) {
                await supabase
                  .from("subscriptions")
                  .update({ leads_used: (sub.leads_used || 0) + 1 })
                  .eq("user_id", channel.user_id);
              }
            }

            // Mark as seen
            await sendCommand(`S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
            totalProcessed++;
          } catch (msgErr) {
            console.error(`[EMAIL-POLL] Error processing message ${msgId}:`, msgErr);
          }
        }

        await sendCommand("A099", "LOGOUT");
        conn.close();
      } catch (channelErr) {
        console.error(`[EMAIL-POLL] Error for channel ${channel.id}:`, channelErr);
        // Mark channel as errored
        await supabase
          .from("channels")
          .update({ connection_status: "error" })
          .eq("id", channel.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: totalProcessed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EMAIL-POLL] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
