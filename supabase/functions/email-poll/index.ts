import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import PostalMime from "npm:postal-mime@3.0.0";
import { routerChatCompletion } from "../_shared/router-chat-compat.ts";

import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { requireCronAuth } from "../_shared/cron-auth.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { connectTlsToPublicHostname } from "../_shared/public-network-guard.ts";
import {
  blocksNormalIngress,
  extractSecurityUrls,
  scanInboundContent,
} from "../_shared/content-security-client.ts";
import { stageInboundAttachment } from "../_shared/content-security-attachment-client.ts";

const ALLOW_ANY_ORIGIN = false;
const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: ALLOW_ANY_ORIGIN });

const encoder = new TextEncoder();
const textDecoder = new TextDecoder();
const asciiDecoder = new TextDecoder("ascii");
const MAX_RAW_EMAIL_BYTES = 40 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_ATTACHMENTS = 50;
const MAX_IMAP_CONTROL_BYTES = 128 * 1024;
const MIME_MAX_NESTING_DEPTH = 64;
const MIME_MAX_HEADERS_BYTES = 1024 * 1024;

type ParsedAttachment = {
  index: number;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
};

async function readBytesFromConn(
  conn: Deno.TlsConn | Deno.TcpConn,
  timeoutMs = 10_000,
): Promise<Uint8Array | null> {
  const buf = new Uint8Array(16_384);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try { conn.close(); } catch { /* noop */ }
  }, timeoutMs);
  try {
    const n = await conn.read(buf);
    clearTimeout(timer);
    if (timedOut || !n) return null;
    return buf.slice(0, n);
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

async function readGreeting(conn: Deno.TlsConn | Deno.TcpConn): Promise<string> {
  const chunk = await readBytesFromConn(conn);
  return chunk ? textDecoder.decode(chunk) : "";
}

async function imapCommand(
  conn: Deno.TlsConn | Deno.TcpConn,
  tag: string,
  cmd: string,
  timeoutMs = 15_000,
): Promise<string> {
  await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
  let response = "";
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chunk = await readBytesFromConn(conn, Math.max(deadline - Date.now(), 1000));
    if (!chunk) break;
    response += decoder.decode(chunk, { stream: true });
    if (response.includes(`${tag} OK`) || response.includes(`${tag} NO`) || response.includes(`${tag} BAD`)) break;
  }
  response += decoder.decode();
  return response;
}

/**
 * Reads one IMAP literal without decoding the literal bytes as text. Only the
 * ASCII control prefix/suffix is decoded. This keeps attachment bytes exact for
 * MIME decoding and malware hashing, including 8-bit/binary message bodies.
 */
async function imapLiteralCommand(
  conn: Deno.TlsConn | Deno.TcpConn,
  tag: string,
  cmd: string,
  maxLiteralBytes: number,
  timeoutMs = 45_000,
): Promise<Uint8Array> {
  await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
  const chunks: Uint8Array[] = [];
  let total = 0;
  let literalStart = -1;
  let literalLength = -1;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const chunk = await readBytesFromConn(conn, Math.max(deadline - Date.now(), 1000));
    if (!chunk) break;
    chunks.push(chunk);
    total += chunk.byteLength;

    if (total > maxLiteralBytes + MAX_IMAP_CONTROL_BYTES) {
      throw new Error("EMAIL_IMAP_LITERAL_RESPONSE_TOO_LARGE");
    }

    const combined = concatBytes(chunks, total);
    if (literalStart < 0) {
      const controlPrefix = asciiDecoder.decode(combined.subarray(0, Math.min(combined.byteLength, MAX_IMAP_CONTROL_BYTES)));
      const marker = /\{(\d+)\}\r\n/.exec(controlPrefix);
      if (marker?.index !== undefined) {
        literalLength = Number(marker[1]);
        if (!Number.isInteger(literalLength) || literalLength < 0 || literalLength > maxLiteralBytes) {
          throw new Error("EMAIL_IMAP_LITERAL_SIZE_INVALID");
        }
        // The IMAP literal marker is ASCII, so character and byte offsets are identical.
        literalStart = marker.index + marker[0].length;
      }
    }

    if (literalStart >= 0 && literalLength >= 0) {
      const literalEnd = literalStart + literalLength;
      if (combined.byteLength >= literalEnd) {
        const suffix = asciiDecoder.decode(combined.subarray(literalEnd));
        if (suffix.includes(`${tag} NO`) || suffix.includes(`${tag} BAD`)) {
          throw new Error("EMAIL_IMAP_LITERAL_FETCH_REJECTED");
        }
        if (suffix.includes(`${tag} OK`)) {
          return combined.slice(literalStart, literalEnd);
        }
      }
    }
  }

  throw new Error("EMAIL_IMAP_LITERAL_INCOMPLETE");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function mailboxField(value: unknown, field: "address" | "name"): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  return typeof record[field] === "string" ? record[field].trim() : "";
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  return sha256HexBytes(encoder.encode(input));
}

async function canonicalMessageIdToken(messageId: string): Promise<string> {
  return `email_mid:${await sha256Hex(messageId.trim())}`;
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
  if (params.messageId) return canonicalMessageIdToken(params.messageId);
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

function attachmentBytes(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) {
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  }
  throw new Error("EMAIL_ATTACHMENT_CONTENT_INVALID");
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
          conn = await connectTlsToPublicHostname(host, 993);

          const greeting = await readGreeting(conn);
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
              const metaTag = `M${msgId}`;
              const metaResp = await imapCommand(
                conn,
                metaTag,
                `FETCH ${msgId} (UID RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID IN-REPLY-TO CONTENT-TYPE)])`,
                20_000,
              );
              const imapUid = metaResp.match(/\bUID\s+(\d+)\b/i)?.[1] ?? null;
              const rawSize = Number(metaResp.match(/RFC822\.SIZE\s+(\d+)/i)?.[1] ?? 0);
              if (!imapUid || !Number.isInteger(rawSize) || rawSize <= 0) {
                throw new Error("EMAIL_IMAP_METADATA_INVALID");
              }
              if (rawSize > MAX_RAW_EMAIL_BYTES) {
                throw new Error("EMAIL_RAW_MESSAGE_TOO_LARGE");
              }

              const rawTag = `R${msgId}`;
              const rawEmailBytes = await imapLiteralCommand(
                conn,
                rawTag,
                `FETCH ${msgId} (BODY.PEEK[])`,
                MAX_RAW_EMAIL_BYTES,
                45_000,
              );
              if (rawEmailBytes.byteLength !== rawSize) {
                throw new Error("EMAIL_RAW_MESSAGE_SIZE_MISMATCH");
              }

              const parsed = await PostalMime.parse(rawEmailBytes, {
                attachmentEncoding: "arraybuffer",
                forceRfc822Attachments: true,
                maxNestingDepth: MIME_MAX_NESTING_DEPTH,
                maxHeadersSize: MIME_MAX_HEADERS_BYTES,
                maxRfc822NestingDepth: 0,
              });

              const fromEmail = mailboxField(parsed.from, "address") || "unknown@email.com";
              const fromName = mailboxField(parsed.from, "name") || fromEmail;
              const subject = typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim() : "(No Subject)";
              const dateStr = typeof parsed.date === "string" && parsed.date.trim() ? parsed.date.trim() : null;
              const messageId = typeof parsed.messageId === "string" && parsed.messageId.trim() ? parsed.messageId.trim() : null;
              const inReplyTo = typeof parsed.inReplyTo === "string" && parsed.inReplyTo.trim() ? parsed.inReplyTo.trim() : null;
              const headers = {
                inReplyTo,
                hasAttachment: rawAttachments.length > 0,
              };
              const plainText = typeof parsed.text === "string" ? parsed.text : "";
              const htmlText = typeof parsed.html === "string" ? stripHtml(parsed.html) : "";
              const textBody = (plainText || htmlText || subject).trim();
              const messageContent = subject !== "(No Subject)"
                ? `[${subject}] ${textBody.substring(0, 2000)}`
                : textBody.substring(0, 2000);

              const rawAttachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];
              if (rawAttachments.length > MAX_ATTACHMENTS) throw new Error("EMAIL_ATTACHMENT_COUNT_LIMIT");

              const attachments: ParsedAttachment[] = [];
              let totalAttachmentBytes = 0;
              for (let index = 0; index < rawAttachments.length; index++) {
                const attachment = rawAttachments[index];
                if ((attachment as Record<string, unknown>).rfc822DepthExceeded === true) {
                  throw new Error("EMAIL_RFC822_DEPTH_EXCEEDED");
                }
                const bytes = attachmentBytes(attachment.content);
                if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("EMAIL_ATTACHMENT_TOO_LARGE");
                totalAttachmentBytes += bytes.byteLength;
                if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error("EMAIL_ATTACHMENTS_TOTAL_TOO_LARGE");
                attachments.push({
                  index,
                  bytes,
                  mimeType: String(attachment.mimeType || "application/octet-stream").toLowerCase(),
                  sha256: await sha256HexBytes(bytes),
                });
              }

              const eventId = await canonicalEmailEventId({
                channelId: channel.id,
                uidValidity,
                imapUid,
                fromEmail,
                dateStr,
                subject,
                messageContent,
                messageId,
              });

              let aggregateAttachment: { mime_type: string; size_bytes: number; sha256: string } | null = null;
              if (attachments.length > 0) {
                const manifest = attachments.map((attachment) => ({
                  index: attachment.index,
                  mime_type: attachment.mimeType,
                  byte_size: attachment.bytes.byteLength,
                  sha256: attachment.sha256,
                }));
                aggregateAttachment = {
                  mime_type: attachments.length === 1 ? attachments[0].mimeType : "multipart/mixed",
                  size_bytes: totalAttachmentBytes,
                  sha256: attachments.length === 1 ? attachments[0].sha256 : await sha256Hex(JSON.stringify(manifest)),
                };
              }

              const security = await scanInboundContent({
                workspace_id: channel.workspace_id,
                source: "email",
                event_id: eventId,
                content: messageContent,
                urls: extractSecurityUrls(messageContent),
                attachment: aggregateAttachment,
              });

              if (!security.ok) throw new Error(`EMAIL_CONTENT_SECURITY_${security.code}`);

              if (blocksNormalIngress(security.decision)) {
                if (attachments.length > 0 && security.decision.action === "quarantine") {
                  for (const attachment of attachments) {
                    const staged = await stageInboundAttachment({
                      workspace_id: channel.workspace_id,
                      source: "email",
                      event_id: eventId,
                      attachment_key: `email_att_${attachment.index}`,
                      expected_attachment_count: attachments.length,
                      bytes: attachment.bytes,
                      mime_type: attachment.mimeType,
                    });
                    if (!staged.ok) throw new Error(`EMAIL_ATTACHMENT_STAGE_${staged.code}`);
                  }
                }
                totalSkipped++;
                // Attachment-bearing mail stays UNSEEN (waiting for malware scan completion)
                if (!headers.hasAttachment) {
                  await imapCommand(conn, `S${msgId}`, `STORE ${msgId} +FLAGS (\\Seen)`);
                }
                continue;
              }

              if (attachments.length > 0) throw new Error("EMAIL_ATTACHMENT_SECURITY_CONTRACT_VIOLATION");

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

              const msgTimestamp = dateStr && !Number.isNaN(Date.parse(dateStr))
                ? new Date(dateStr).toISOString()
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
                      const parsedAi = JSON.parse(tc.function.arguments);
                      aiScore = parsedAi.intent_score;
                      suggestedReply = parsedAi.suggested_reply;
                    }
                  }
                } catch (error) {
                  console.error("[EMAIL-POLL] AI analysis error:", error);
                }
              }

              let threadId: string | null = null;
              if (inReplyTo) {
                const canonicalReplyId = await canonicalMessageIdToken(inReplyTo);
                const { data: replyThread } = await supabase
                  .from("inbox_messages")
                  .select("thread_id")
                  .eq("workspace_id", channel.workspace_id)
                  .eq("channel_id", channel.id)
                  .in("provider_message_id", [canonicalReplyId, headers.inReplyTo])
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
                  .eq("contact_identifier", fromEmail)
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

              const metadata: Record<string, unknown> = {
                external_event_id: eventId,
                content_security: {
                  event_id: eventId,
                  category: security.decision.category,
                  risk_score: security.decision.risk_score,
                  action: security.decision.action,
                },
              };
              if (messageId) metadata.external_message_id = messageId;
              if (imapUid) metadata.imap_uid = imapUid;
              if (uidValidity) metadata.imap_uidvalidity = uidValidity;
              if (inReplyTo) metadata.in_reply_to = inReplyTo;

              const { data: insertedInboxMsg, error: inboxError } = await supabase
                .from("inbox_messages")
                .insert({
                  user_id: channel.user_id,
                  workspace_id: channel.workspace_id,
                  channel_id: channel.id,
                  channel_type: "email",
                  provider_message_id: eventId,
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
                  source_name: fromEmail,
                  source_type: "email",
                  channel_type: "email",
                  contact_identifier: fromEmail,
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
              console.error(`[EMAIL-POLL] Error processing message ${msgId}:`, msgErr instanceof Error ? msgErr.message : "unknown");
              totalErrors++;
            }
          }

          await imapCommand(conn, "A099", "LOGOUT");
          conn.close();
          conn = null;
          success = true;
        } catch (channelErr) {
          console.error(`[EMAIL-POLL] Error for channel ${channel.id} (attempt ${attempt}):`, channelErr instanceof Error ? channelErr.message : "unknown");
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
    console.error("[EMAIL-POLL] Error:", error instanceof Error ? error.message : "unknown");
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...getCors(req), "Content-Type": "application/json" },
    });
  }
});
