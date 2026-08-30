import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { connectTlsToPublicHostname } from "../_shared/public-network-guard.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readFromConn(conn: Deno.TlsConn | Deno.TcpConn, timeoutMs = 10_000): Promise<string> {
  const buf = new Uint8Array(16384);
  const timer = setTimeout(() => { try { conn.close(); } catch { /* noop */ } }, timeoutMs);
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
  bodyText = bodyText.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return bodyText;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function canonicalEmailEventId(params: {
  channelId: string;
  uidValidity: string | null;
  imapUid: string | null;
  fromEmail: string;
  dateStr: string | null;
  subject: string;
  messageContent: string;
  messageId: string | null;
}): Promise<string> {
  if (params.messageId) return params.messageId;
  const hash = await sha256Hex([
    params.channelId,
    params.uidValidity ?? "",
    params.imapUid ?? "",
    params.fromEmail,
    params.dateStr ?? "",
    params.subject,
    params.messageContent,
  ].join("\n"));
  return `email_sha256:${hash}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });
  const unauth = requireCronAuth(req);
  if (unauth) return new Response(unauth.body, { status: unauth.status, headers: { "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    getServiceKey() ?? "",
    { auth: { persistSession: false } },
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
        headers: { ...getCors(req), "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const channel of emailChannels) {
      if (!channel.workspace_id || !channel.user_id) {
        console.error(`[EMAIL-POLL] Channel ${channel.id} has no canonical tenant identity; skipping`);
        totalErrors++;
        continue;
      }

      const settings = (channel.settings ?? {}) as Record<string, unknown>;
      const credentials = (channel.credentials_encrypted ?? {}) as Record<string, unknown>;
      const host = String(settings.imap_host ?? settings.imap_server ?? "").trim().toLowerCase();
      const port = Number(settings.imap_port ?? 993);
      const user = String(settings.imap_user ?? settings.imap_username ?? "").trim();
      const storedPassword = String(credentials.imap_password ?? settings.imap_password ?? "");
      const useTls = (settings.imap_tls ?? settings.use_ssl ?? true) !== false;

      if (!host || !user || !storedPassword) {
        console.log(`[EMAIL-POLL] Channel ${channel.id} missing IMAP credentials, skipping`);
        continue;
      }
      if (!useTls || port !== 993) {
        console.error(`[EMAIL-POLL] Channel ${channel.id} is not configured for required IMAPS:993; skipping`);
        totalErrors++;
        continue;
      }

      let pass: string;
      try {
        pass = await decryptIfNeeded(storedPassword);
      } catch {
        console.error(`[EMAIL-POLL] Channel ${channel.id} password decryption failed`);
        totalErrors++;
        continue;
      }

      let attempt = 0;
      const maxAttempts = 3;
      let success = false;

      while (attempt < maxAttempts && !success) {
        attempt++;
        let conn: Deno.TlsConn | null = null;

        try {
          // Re-resolve and pin a public IP on every cron connection before any
          // credential is sent. This closes the stored-host SSRF/DNS-rebinding path.
          conn = await connectTlsToPublicHostname(host, 993);

          const greeting = await readFromConn(conn);
          if (!greeting.includes("OK")) {
            throw new Error(`IMAP server did not send OK greeting: ${greeting.substring(0, 100)}`);
          }

          const escapedPass = pass.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const escapedUser = user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          const loginResp = await imapCommand(conn, "A001", `LOGIN "${escapedUser}" "${escapedPass}"`);
          if (!loginResp.includes("A001 OK")) {
            console.error(`[EMAIL-POLL] Login failed for channel ${channel.id} (attempt ${attempt})`);
            if (attempt === maxAttempts) {
              await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
            }
            conn.close();
            conn = null;
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
            continue;
          }

          const selectResp = await imapCommand(conn, "A002", "SELECT INBOX");
          if (!selectResp.includes("A002 OK")) throw new Error("Failed to SELECT INBOX");
          const uidValidity = selectResp.match(/UIDVALIDITY\s+(\d+)/i)?.[1] ?? null;

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

          const idsToFetch = messageIds.slice(-20);

          for (const msgId of idsToFetch) {
            try {
              const fetchResp = await imapCommand(
                conn,
                `F${msgId}`,
                `FETCH ${msgId} (UID BODY[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO CONTENT-TYPE)] BODY[TEXT])`,
                20_000,
              );

              const headers = parseEmailHeaders(fetchResp);
              const imapUid = fetchResp.match(/\bUID\s+(\d+)\b/i)?.[1] ?? null;
              let bodyText = extractTextBody(fetchResp);
              if (!bodyText) bodyText = headers.subject;
              const messageContent = headers.subject !== "(No Subject)"
                ? `[${headers.subject}] ${bodyText.substring(0, 2000)}`
                : bodyText.substring(0, 2000);
              const eventId = await canonicalEmailEventId({
                channelId: channel.id,
                uidValidity,
                imapUid,
                fromEmail: headers.fromEmail,
                dateStr: headers.dateStr,
                subject: headers.subject,
                messageContent,
                messageId: headers.messageId,
              });

              const { data: existingMsg, error: existingError } = await supabase
                .from("inbox_messages")
                .select("id")
                .eq("workspace_id", channel.workspace_id)
                .eq("channel_id", channel.id)
                .eq("provider_message_id", eventId)
                .limit(1)
                .maybeSingle();
              if (existingError) throw existingError;
              if (existingMsg) {
                totalSkipped++;
                await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                continue;
              }

              const msgTimestamp = headers.dateStr && !Number.isNaN(Date.parse(headers.dateStr))
                ? new Date(headers.dateStr).toISOString()
                : new Date().toISOString();

              const { data: keywords, error: keywordsError } = await supabase
                .from("keywords")
                .select("keyword")
                .eq("workspace_id", channel.workspace_id)
                .eq("is_active", true);
              if (keywordsError) throw keywordsError;

              const textLower = messageContent.toLowerCase();
              const matched = (keywords || [])
                .filter((keyword: { keyword: string }) => textLower.includes(keyword.keyword.toLowerCase()))
                .map((keyword: { keyword: string }) => keyword.keyword);

              let aiScore = matched.length > 0 ? 0.5 : 0.1;
              let suggestedReply = "";

              if (matched.length > 0) {
                try {
                  const { data: profile } = await supabase
                    .from("business_profiles")
                    .select("*")
                    .eq("workspace_id", channel.workspace_id)
                    .maybeSingle();

                  const aiRes = await routerChatCompletion({
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
                  }, { workspaceId: channel.workspace_id, userId: channel.user_id, taskType: "customer_support" });
                  if (aiRes.ok) {
                    const aiData = await aiRes.json();
                    const tc = aiData.choices?.[0]?.message?.tool_calls?.[0];
                    if (tc) {
                      const parsed = JSON.parse(tc.function.arguments);
                      aiScore = parsed.intent_score;
                      suggestedReply = parsed.suggested_reply;
                    }
                  }
                } catch (error) {
                  console.error("[EMAIL-POLL] AI analysis error:", error);
                }
              }

              let threadId: string | null = null;
              if (headers.inReplyTo) {
                const { data: replyThread } = await supabase
                  .from("inbox_messages")
                  .select("thread_id")
                  .eq("workspace_id", channel.workspace_id)
                  .eq("channel_id", channel.id)
                  .eq("provider_message_id", headers.inReplyTo)
                  .not("thread_id", "is", null)
                  .limit(1)
                  .maybeSingle();
                if (replyThread?.thread_id) threadId = replyThread.thread_id;
              }

              if (!threadId) {
                const { data: existingThread } = await supabase
                  .from("conversation_threads")
                  .select("id")
                  .eq("workspace_id", channel.workspace_id)
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
                }).eq("id", threadId).eq("workspace_id", channel.workspace_id);
              }

              const metadata: Record<string, unknown> = { external_event_id: eventId };
              if (headers.messageId) metadata.external_message_id = headers.messageId;
              if (imapUid) metadata.imap_uid = imapUid;
              if (uidValidity) metadata.imap_uidvalidity = uidValidity;
              if (headers.inReplyTo) metadata.in_reply_to = headers.inReplyTo;
              if (headers.hasAttachment) metadata.has_attachment = true;

              const { data: insertedInboxMsg, error: inboxError } = await supabase
                .from("inbox_messages")
                .insert({
                  user_id: channel.user_id,
                  workspace_id: channel.workspace_id,
                  channel_id: channel.id,
                  channel_type: "email",
                  provider_message_id: eventId,
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
                  metadata,
                })
                .select("id")
                .single();

              if (inboxError) {
                if (inboxError.code === "23505") {
                  totalSkipped++;
                  await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                  continue;
                }
                throw inboxError;
              }

              if (matched.length > 0 && aiScore >= 0.3) {
                await supabase.from("leads").insert({
                  user_id: channel.user_id,
                  workspace_id: channel.workspace_id,
                  message_content: messageContent,
                  source_name: headers.fromEmail,
                  source_type: "email",
                  channel_type: "email",
                  contact_identifier: headers.fromEmail,
                  thread_id: threadId || null,
                  inbox_message_id: insertedInboxMsg?.id || null,
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
          if (conn) { try { conn.close(); } catch { /* noop */ } }
          if (attempt === maxAttempts) {
            await supabase.from("channels").update({ connection_status: "error" }).eq("id", channel.id);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
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
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EMAIL-POLL] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
