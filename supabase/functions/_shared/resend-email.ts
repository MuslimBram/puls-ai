export class EmailDeliveryError extends Error {
  status: number;
  retryAfterSeconds: number | null;

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ResendEmailPayload = {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export async function sendResendEmail(payload: ResendEmailPayload): Promise<{ id: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new EmailDeliveryError("RESEND_API_KEY not configured", 503);

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (payload.idempotencyKey) {
    requestHeaders["Idempotency-Key"] = payload.idempotencyKey.slice(0, 256);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      ...(payload.html ? { html: payload.html } : {}),
      ...(payload.text ? { text: payload.text } : {}),
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      ...(payload.headers ? { headers: payload.headers } : {}),
    }),
  });

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = responseText ? JSON.parse(responseText) : {}; } catch { /* keep raw text */ }

  if (!response.ok) {
    const retryAfterRaw = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterRaw && /^\d+$/.test(retryAfterRaw)
      ? Number(retryAfterRaw)
      : null;
    const message = String(parsed.message || parsed.name || responseText || `Resend error ${response.status}`);
    throw new EmailDeliveryError(message, response.status, retryAfterSeconds);
  }

  return { id: typeof parsed.id === "string" ? parsed.id : null };
}
