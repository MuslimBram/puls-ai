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
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const channel of emailChannels) {
      const settings = channel.settings as Record<string, any> | null;
      if (!settings?.imap_host || !settings?.imap_user || !settings?.imap_password) {
        console.log(`[EMAIL-POLL] Channel ${channel.id} missing IMAP credentials, skipping`);
        continue;
      }

      // Retry mechanism - up to 3 attempts per channel
      let attempt = 0;
      const maxAttempts = 3;
      let success = false;

      while (attempt < maxAttempts && !success) {
        attempt++;
        try {
          const host = settings.imap_host;
          const port = settings.imap_port || 993;
          const user = settings.imap_user;
          const pass = settings.imap_password;
          const useTls = settings.imap_tls !== false;

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

          await readResponse();

          const loginResp = await sendCommand("A001", `LOGIN "${user}" "${pass}"`);
          if (!loginResp.includes("A001 OK")) {
            console.error(`[EMAIL-POLL] Login failed for channel ${channel.id} (attempt ${attempt})`);
            conn.close();
            if (attempt === maxAttempts) {
              await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
            }
            continue;
          }

          await sendCommand("A002", "SELECT INBOX");

          const searchResp = await sendCommand("A003", "SEARCH UNSEEN");
          const searchMatch = searchResp.match(/\* SEARCH (.+)/);
          const messageIds = searchMatch ? searchMatch[1].trim().split(/\s+/).filter(Boolean) : [];

          if (messageIds.length === 0) {
            await sendCommand("A099", "LOGOUT");
            conn.close();
            success = true;
            continue;
          }

          const idsToFetch = messageIds.slice(-20);

          for (const msgId of idsToFetch) {
            try {
              const fetchResp = await sendCommand(`F${msgId}`, `FETCH ${msgId} (BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)] BODY[TEXT])`);

              const fromMatch = fetchResp.match(/From:\s*(.+)/i);
              const subjectMatch = fetchResp.match(/Subject:\s*(.+)/i);
              const dateMatch = fetchResp.match(/Date:\s*(.+)/i);
              const messageIdMatch = fetchResp.match(/Message-ID:\s*(.+)/i);

              const fromRaw = fromMatch?.[1]?.trim() || "unknown@email.com";
              const subject = subjectMatch?.[1]?.trim() || "(No Subject)";
              const dateStr = dateMatch?.[1]?.trim();
              const externalMessageId = messageIdMatch?.[1]?.trim() || null;

              const emailMatch = fromRaw.match(/<(.+?)>/);
              const fromEmail = emailMatch ? emailMatch[1] : fromRaw;
              const fromName = fromRaw.replace(/<.+>/, "").replace(/"/g, "").trim() || fromEmail;

              // DEDUPLICATION: Check if message already exists
              if (externalMessageId) {
                const { data: existingMsg } = await supabase
                  .from("inbox_messages")
                  .select("id")
                  .eq("user_id", channel.user_id)
                  .eq("channel_id", channel.id)
                  .contains("metadata", { external_message_id: externalMessageId })
                  .maybeSingle();

                if (existingMsg) {
                  totalSkipped++;
                  await sendCommand(`S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                  continue;
                }
              }

              // Also deduplicate by sender+subject+timestamp
              const msgTimestamp = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
              const { data: dupCheck } = await supabase
                .from("inbox_messages")
                .select("id")
                .eq("user_id", channel.user_id)
                .eq("sender_identifier", fromEmail)
                .eq("message_timestamp", msgTimestamp)
                .maybeSingle();

              if (dupCheck) {
                totalSkipped++;
                await sendCommand(`S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                continue;
              }

              // Extract body
              const bodyStart = fetchResp.indexOf("\r\n\r\n", fetchResp.indexOf("BODY[TEXT]"));
              let bodyText = bodyStart > -1 ? fetchResp.substring(bodyStart + 4) : "";
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

              // Threading: find existing thread by sender
              let threadId: string | null = null;
              const { data: existingThread } = await supabase
                .from("conversation_threads")
                .select("id")
                .eq("user_id", channel.user_id)
                .eq("channel_type", "email")
                .eq("contact_identifier", fromEmail)
                .eq("status", "open")
                .order("last_message_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (existingThread) {
                threadId = existingThread.id;
                // Update thread
                await supabase
                  .from("conversation_threads")
                  .update({
                    last_message_at: msgTimestamp,
                    message_count: (existingThread as any).message_count ? (existingThread as any).message_count + 1 : 1,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", threadId);
              }

              // Insert inbox message with workspace_id and dedup metadata
              await supabase.from("inbox_messages").insert({
                user_id: channel.user_id,
                workspace_id: channel.workspace_id,
                channel_id: channel.id,
                channel_type: "email",
                source_name: fromEmail,
                sender_name: fromName,
                sender_identifier: fromEmail,
                message_content: messageContent,
                message_timestamp: msgTimestamp,
                intent_score: aiScore,
                matched_keywords: matched,
                is_unread: true,
                priority: aiScore >= 0.7 ? "high" : matched.length > 0 ? "medium" : "normal",
                status: "new",
                thread_id: threadId,
                metadata: externalMessageId ? { external_message_id: externalMessageId } : null,
              });

              if (matched.length > 0 && aiScore >= 0.3) {
                await supabase.from("leads").insert({
                  user_id: channel.user_id,
                  workspace_id: channel.workspace_id,
                  message_content: messageContent,
                  source_name: fromEmail,
                  source_type: "email",
                  message_date: msgTimestamp,
                  detected_keyword: matched[0],
                  intent_score: aiScore,
                  suggested_reply: suggestedReply,
                  status: "new",
                });

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

              await sendCommand(`S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
              totalProcessed++;
            } catch (msgErr) {
              console.error(`[EMAIL-POLL] Error processing message ${msgId}:`, msgErr);
              totalErrors++;
            }
          }

          await sendCommand("A099", "LOGOUT");
          conn.close();
          success = true;
        } catch (channelErr) {
          console.error(`[EMAIL-POLL] Error for channel ${channel.id} (attempt ${attempt}):`, channelErr);
          if (attempt === maxAttempts) {
            await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
          } else {
            // Wait before retry
            await new Promise(r => setTimeout(r, 2000 * attempt));
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processed: totalProcessed,
      skipped_duplicates: totalSkipped,
      errors: totalErrors,
    }), {
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
