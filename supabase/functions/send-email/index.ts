import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Send email via SMTP
 * 
 * Body:
 *   { to: string, subject: string, body: string, reply_to_message_id?: string }
 * 
 * Uses SMTP credentials from user's email channel settings.
 * Implements raw SMTP over TLS (Deno-native, no npm deps).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { to, subject, body: emailBody, reply_to_message_id } = await req.json();
    if (!to || !emailBody) throw new Error("'to' and 'body' are required");

    // Get email channel SMTP credentials
    const { data: channels } = await supabase
      .from("channels")
      .select("id, settings, workspace_id")
      .eq("user_id", user.id)
      .eq("channel_type", "email")
      .eq("is_enabled", true)
      .limit(1);

    const channel = channels?.[0];
    const settings = channel?.settings as Record<string, any> | null;

    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_password) {
      throw new Error("Email SMTP not configured. Add SMTP credentials in your email channel settings.");
    }

    const smtpHost = settings.smtp_host;
    const smtpPort = settings.smtp_port || 587;
    const smtpUser = settings.smtp_user;
    const smtpPass = settings.smtp_password;
    const fromEmail = settings.smtp_from || settings.imap_user || smtpUser;
    const fromName = settings.smtp_from_name || "LeadPulse";

    // Connect via TLS
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let conn: Deno.TlsConn | Deno.TcpConn;

    if (smtpPort === 465) {
      conn = await Deno.connectTls({ hostname: smtpHost, port: smtpPort });
    } else {
      conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
    }

    const readLine = async (): Promise<string> => {
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      return n ? decoder.decode(buf.subarray(0, n)) : "";
    };

    const sendCmd = async (cmd: string): Promise<string> => {
      await conn.write(encoder.encode(cmd + "\r\n"));
      return await readLine();
    };

    // Greeting
    await readLine();

    // EHLO
    let ehloRes = await sendCmd(`EHLO localhost`);

    // STARTTLS if not already TLS (port 587)
    if (smtpPort !== 465 && ehloRes.includes("STARTTLS")) {
      await sendCmd("STARTTLS");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: smtpHost });
      ehloRes = await sendCmd(`EHLO localhost`);
    }

    // AUTH LOGIN
    const authRes = await sendCmd("AUTH LOGIN");
    if (!authRes.startsWith("334")) throw new Error("SMTP AUTH not supported: " + authRes);

    const userRes = await sendCmd(btoa(smtpUser));
    if (!userRes.startsWith("334")) throw new Error("SMTP user rejected: " + userRes);

    const passRes = await sendCmd(btoa(smtpPass));
    if (!passRes.startsWith("235")) throw new Error("SMTP auth failed: " + passRes);

    // MAIL FROM
    const fromRes = await sendCmd(`MAIL FROM:<${fromEmail}>`);
    if (!fromRes.startsWith("250")) throw new Error("MAIL FROM rejected: " + fromRes);

    // RCPT TO
    const rcptRes = await sendCmd(`RCPT TO:<${to}>`);
    if (!rcptRes.startsWith("250")) throw new Error("RCPT TO rejected: " + rcptRes);

    // DATA
    const dataRes = await sendCmd("DATA");
    if (!dataRes.startsWith("354")) throw new Error("DATA rejected: " + dataRes);

    // Build RFC822 message
    const messageId = `<${crypto.randomUUID()}@${smtpHost}>`;
    const headers = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: ${to}`,
      `Subject: ${subject || "(No Subject)"}`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
    ];

    if (reply_to_message_id) {
      headers.push(`In-Reply-To: ${reply_to_message_id}`);
      headers.push(`References: ${reply_to_message_id}`);
    }

    const fullMessage = headers.join("\r\n") + "\r\n\r\n" + emailBody + "\r\n.\r\n";
    const endRes = await sendCmd(fullMessage.replace(/^\./gm, ".."));
    
    await sendCmd("QUIT");
    try { conn.close(); } catch { /* */ }

    const sent = endRes.startsWith("250");

    // Record in inbox + thread
    const { data: threadId } = await supabase.rpc("upsert_conversation_thread", {
      _user_id: user.id,
      _channel_type: "email",
      _contact_identifier: to,
      _contact_name: to,
      _message_preview: subject || emailBody.substring(0, 100),
      _direction: "outbound",
    });

    await supabase.from("inbox_messages").insert({
      user_id: user.id,
      workspace_id: channel?.workspace_id,
      channel_id: channel?.id,
      channel_type: "email",
      source_name: fromEmail,
      sender_name: fromName,
      sender_identifier: fromEmail,
      message_content: subject ? `[${subject}] ${emailBody}` : emailBody,
      message_timestamp: new Date().toISOString(),
      is_unread: false,
      status: "sent",
      direction: "outbound",
      delivery_status: sent ? "sent" : "failed",
      thread_id: threadId || null,
      metadata: { external_message_id: messageId, recipient: to },
    } as any);

    return new Response(JSON.stringify({ ok: sent, message_id: messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[SEND-EMAIL] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
