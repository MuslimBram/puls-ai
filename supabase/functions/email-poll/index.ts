import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── IMAP Helpers ───
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readFromConn(conn: Deno.TlsConn | Deno.TcpConn, timeoutMs = 10_000): Promise<string> {
  const buf = new Uint8Array(16384);
  const timer = setTimeout(() => { try { conn.close(); } catch { /* */ } }, timeoutMs);
  try {
    const n = await conn.read(buf);
    clearTimeout(timer);
    return n ? decoder.decode(buf.subarray(0, n)) : "";
  } catch {
    clearTimeout(timer);
    return "";
  }
}

async function imapCommand(conn: Deno.TlsConn | Deno.TcpConn, tag: string, cmd: string, timeoutMs = 15_000): Promise<string> {
  await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
  let response = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await readFromConn(conn, Math.max(deadline - Date.now(), 1000));
    response += chunk;
    if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) break;
    if (!chunk) break;
  }
  return response;
}

function parseEmailHeaders(raw: string) {
  const fromMatch = raw.match(/From:\s*(.+)/i);
  const subjectMatch = raw.match(/Subject:\s*(.+)/i);
  const dateMatch = raw.match(/Date:\s*(.+)/i);
  const messageIdMatch = raw.match(/Message-ID:\s*(<[^>]+>|[^\s]+)/i);
  const inReplyToMatch = raw.match(/In-Reply-To:\s*(<[^>]+>|[^\s]+)/i);
  const contentTypeMatch = raw.match(/Content-Type:\s*([^;\r\n]+)/i);

  const fromRaw = fromMatch?.[1]?.trim() || "unknown@email.com";
  const emailMatch = fromRaw.match(/<(.+?)>/);
  const fromEmail = emailMatch ? emailMatch[1] : fromRaw;
  const fromName = fromRaw.replace(/<.+>/, "").replace(/"/g, "").trim() || fromEmail;

  return {
    fromEmail,
    fromName,
    subject: subjectMatch?.[1]?.trim() || "(No Subject)",
    dateStr: dateMatch?.[1]?.trim() || null,
    messageId: messageIdMatch?.[1]?.trim() || null,
    inReplyTo: inReplyToMatch?.[1]?.trim() || null,
    hasAttachment: /multipart\/mixed/i.test(contentTypeMatch?.[1] || ""),
    contentType: contentTypeMatch?.[1]?.trim() || "text/plain",
  };
}

function extractTextBody(fetchResp: string): string {
  const bodyStart = fetchResp.indexOf("\r\n\r\n", fetchResp.indexOf("BODY[TEXT]"));
  let bodyText = bodyStart > -1 ? fetchResp.substring(bodyStart + 4) : "";
  bodyText = bodyText.replace(/\)\r\n.*$/s, "").trim();
  // Strip HTML tags for plain text
  bodyText = bodyText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return bodyText;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
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

      let attempt = 0;
      const maxAttempts = 3;
      let success = false;

      while (attempt < maxAttempts && !success) {
        attempt++;
        let conn: Deno.TlsConn | Deno.TcpConn | null = null;

        try {
          const host = settings.imap_host;
          const port = settings.imap_port || 993;
          const user = settings.imap_user;
          const pass = settings.imap_password;
          const useTls = settings.imap_tls !== false;

          // TLS-safe connection with hostname verification
          conn = useTls
            ? await Deno.connectTls({ hostname: host, port, alpnProtocols: [] })
            : await Deno.connect({ hostname: host, port });

          // Read server greeting
          const greeting = await readFromConn(conn);
          if (!greeting.includes("OK")) {
            throw new Error(`IMAP server did not send OK greeting: ${greeting.substring(0, 100)}`);
          }

          // Login (escape special chars in password)
          const escapedPass = pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const loginResp = await imapCommand(conn, "A001", `LOGIN "${user}" "${escapedPass}"`);
          if (!loginResp.includes("A001 OK")) {
            console.error(`[EMAIL-POLL] Login failed for channel ${channel.id} (attempt ${attempt})`);
            if (attempt === maxAttempts) {
              await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
            }
            conn.close();
            conn = null;
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
          }

          const selectResp = await imapCommand(conn, "A002", "SELECT INBOX");
          if (!selectResp.includes("A002 OK")) {
            throw new Error("Failed to SELECT INBOX");
          }

          const searchResp = await imapCommand(conn, "A003", "SEARCH UNSEEN");
          const searchMatch = searchResp.match(/\* SEARCH (.+)/);
          const messageIds = searchMatch ? searchMatch[1].trim().split(/\s+/).filter(Boolean) : [];

          if (messageIds.length === 0) {
            await imapCommand(conn, "A099", "LOGOUT");
            conn.close();
            conn = null;
            success = true;
            continue;
          }

          // Process latest 20 messages
          const idsToFetch = messageIds.slice(-20);

          for (const msgId of idsToFetch) {
            try {
              // Fetch headers + text body (skip attachments for safety)
              const fetchResp = await imapCommand(
                conn,
                `F${msgId}`,
                `FETCH ${msgId} (BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO CONTENT-TYPE)] BODY[TEXT])`,
                20_000
              );

              const headers = parseEmailHeaders(fetchResp);

              // DEDUPLICATION by Message-ID
              if (headers.messageId) {
                const { data: existingMsg } = await supabase
                  .from("inbox_messages")
                  .select("id")
                  .eq("user_id", channel.user_id)
                  .eq("channel_id", channel.id)
                  .contains("metadata", { external_message_id: headers.messageId })
                  .maybeSingle();

                if (existingMsg) {
                  totalSkipped++;
                  await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                  continue;
                }
              }

              // Dedup by sender+timestamp
              const msgTimestamp = headers.dateStr ? new Date(headers.dateStr).toISOString() : new Date().toISOString();
              const { data: dupCheck } = await supabase
                .from("inbox_messages")
                .select("id")
                .eq("user_id", channel.user_id)
                .eq("sender_identifier", headers.fromEmail)
                .eq("message_timestamp", msgTimestamp)
                .maybeSingle();

              if (dupCheck) {
                totalSkipped++;
                await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                continue;
              }

              // Extract body (attachment-safe: we only read TEXT part)
              let bodyText = extractTextBody(fetchResp);
              if (!bodyText) bodyText = headers.subject;
              const messageContent = headers.subject !== "(No Subject)"
                ? `[${headers.subject}] ${bodyText.substring(0, 2000)}`
                : bodyText.substring(0, 2000);

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

              let aiScore = matched.length > 0 ? 0.5 : 0.1;
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
                      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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

              // Threading: use In-Reply-To header for reliable threading
              let threadId: string | null = null;
              if (headers.inReplyTo) {
                const { data: replyThread } = await supabase
                  .from("inbox_messages")
                  .select("thread_id")
                  .eq("user_id", channel.user_id)
                  .contains("metadata", { external_message_id: headers.inReplyTo })
                  .not("thread_id", "is", null)
                  .limit(1)
                  .maybeSingle();
                if (replyThread?.thread_id) threadId = replyThread.thread_id;
              }

              // Fallback: thread by sender + open status
              if (!threadId) {
                const { data: existingThread } = await supabase
                  .from("conversation_threads")
                  .select("id")
                  .eq("user_id", channel.user_id)
                  .eq("channel_type", "email")
                  .eq("contact_identifier", headers.fromEmail)
                  .eq("status", "open")
                  .order("last_message_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (existingThread) threadId = existingThread.id;
              }

              if (threadId) {
                await supabase.from("conversation_threads").update({
                  last_message_at: msgTimestamp,
                  updated_at: new Date().toISOString(),
                }).eq("id", threadId);
              }

              // Insert inbox message
              const metadata: Record<string, any> = {};
              if (headers.messageId) metadata.external_message_id = headers.messageId;
              if (headers.inReplyTo) metadata.in_reply_to = headers.inReplyTo;
              if (headers.hasAttachment) metadata.has_attachment = true;

              await supabase.from("inbox_messages").insert({
                user_id: channel.user_id,
                workspace_id: channel.workspace_id,
                channel_id: channel.id,
                channel_type: "email",
                source_name: headers.fromEmail,
                sender_name: headers.fromName,
                sender_identifier: headers.fromEmail,
                message_content: messageContent,
                message_timestamp: msgTimestamp,
                intent_score: aiScore,
                matched_keywords: matched,
                is_unread: true,
                priority: aiScore >= 0.7 ? "high" : matched.length > 0 ? "medium" : "normal",
                status: "new",
                thread_id: threadId,
                metadata: Object.keys(metadata).length > 0 ? metadata : null,
              });

              if (matched.length > 0 && aiScore >= 0.3) {
                await supabase.from("leads").insert({
                  user_id: channel.user_id,
                  workspace_id: channel.workspace_id,
                  message_content: messageContent,
                  source_name: headers.fromEmail,
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
                  await supabase.from("subscriptions")
                    .update({ leads_used: (sub.leads_used || 0) + 1 })
                    .eq("user_id", channel.user_id);
                }
              }

              await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
              totalProcessed++;
            } catch (msgErr) {
              console.error(`[EMAIL-POLL] Error processing message ${msgId}:`, msgErr);
              totalErrors++;
            }
          }

          await imapCommand(conn, "A099", "LOGOUT");
          conn.close();
          conn = null;
          success = true;
        } catch (channelErr) {
          console.error(`[EMAIL-POLL] Error for channel ${channel.id} (attempt ${attempt}):`, channelErr);
          if (conn) { try { conn.close(); } catch { /* */ } }
          if (attempt === maxAttempts) {
            await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
          } else {
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
