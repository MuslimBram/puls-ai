import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { getServiceKey } from "../_shared/admin-client.ts"

const SITE_NAME = "pulsi"
const FROM_DOMAIN = "notify.kohablerjeve.top"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature, svix-id, svix-timestamp, svix-signature',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: `Mirë se vini në ${SITE_NAME} - Konfirmoni emailin tuaj`,
  invite: `Jeni ftuar në ${SITE_NAME}`,
  magiclink: `Lidhja e hyrjes për ${SITE_NAME}`,
  recovery: `Rivendosni fjalëkalimin tuaj te ${SITE_NAME}`,
  email_change: `Konfirmoni ndryshimin e emailit për ${SITE_NAME}`,
  reauthentication: `Kodi i verifikimit për ${SITE_NAME}`,
}

// N1: Standard Webhooks signature verification
async function verifyStandardWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const msgId = headers.get("webhook-id") || headers.get("svix-id")
  const msgTimestamp = headers.get("webhook-timestamp") || headers.get("svix-timestamp")
  const msgSignature = headers.get("webhook-signature") || headers.get("svix-signature")

  if (!msgId || !msgTimestamp || !msgSignature) {
    return false
  }

  // Check timestamp tolerance (5 minutes)
  const timestampSec = parseInt(msgTimestamp, 10)
  const nowSec = Math.floor(Date.now() / 1000)
  if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
    return false
  }

  // Normalize secret key (strip leading v1,whsec_ or whsec_)
  let secretKeyStr = secret.trim()
  if (secretKeyStr.startsWith("v1,whsec_")) {
    secretKeyStr = secretKeyStr.slice(9)
  } else if (secretKeyStr.startsWith("whsec_")) {
    secretKeyStr = secretKeyStr.slice(6)
  }

  let secretBytes: Uint8Array
  try {
    secretBytes = new Uint8Array(
      atob(secretKeyStr).split("").map((c) => c.charCodeAt(0))
    )
  } catch {
    secretBytes = new TextEncoder().encode(secretKeyStr)
  }

  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`
  const encoder = new TextEncoder()

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(toSign))
    const expectedSigBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

    const signatures = msgSignature.split(" ")
    for (const sig of signatures) {
      const parts = sig.split(",")
      const signature = parts.length > 1 ? parts[1] : parts[0]
      if (signature === expectedSigBase64) {
        return true
      }
    }
  } catch (_e) {
    return false
  }

  return false
}

async function sendViaResendWithRetry(
  apiKey: string,
  payload: { from: string; to: string[]; subject: string; html: string; text: string }
): Promise<{ ok: boolean; status: number; text: string }> {
  const maxAttempts = 3
  let delayMs = 500

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        return { ok: true, status: res.status, text: await res.text() }
      }

      const resText = await res.text()
      const isRetryable = res.status === 429 || res.status >= 500

      if (!isRetryable || attempt === maxAttempts) {
        return { ok: false, status: res.status, text: resText }
      }

      const retryAfterHeader = res.headers.get('retry-after')
      if (retryAfterHeader) {
        const parsed = parseInt(retryAfterHeader, 10)
        if (!isNaN(parsed) && parsed > 0) {
          delayMs = Math.min(parsed * 1000, 2000)
        }
      }

      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 2000)))
      delayMs = Math.min(delayMs * 2, 2000)
    } catch (err) {
      if (attempt === maxAttempts) {
        return { ok: false, status: 500, text: err instanceof Error ? err.message : 'Fetch error' }
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 2000)))
      delayMs = Math.min(delayMs * 2, 2000)
    }
  }

  return { ok: false, status: 500, text: 'Max retry attempts exceeded' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const rawBody = await req.text()
  const hookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') || Deno.env.get('AUTH_HOOK_SECRET')

  if (!hookSecret) {
    console.error('SEND_EMAIL_HOOK_SECRET is not configured on server')
    return new Response(
      JSON.stringify({ error: 'Server misconfiguration: SEND_EMAIL_HOOK_SECRET not set' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 1. N1: Standard Webhooks Signature Verification
  const isValidSignature = await verifyStandardWebhookSignature(rawBody, req.headers, hookSecret)
  if (!isValidSignature) {
    console.error('Unauthorized: Invalid Standard Webhook signature')
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Invalid signature' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 2. N2: Parse payload using live deployed v19 auth hook contract
  let verifiedPayload: any
  try {
    verifiedPayload = JSON.parse(rawBody)
  } catch (_e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const user = verifiedPayload.user || {}
  const email_data = verifiedPayload.email_data || verifiedPayload.data || {}
  const recipientEmail = user.email || email_data.email
  const emailType = email_data.email_action_type || email_data.action_type || 'signup'
  const token = email_data.token || ''
  const token_hash = email_data.token_hash || ''
  const token_hash_new = email_data.token_hash_new || ''
  const redirect_to = email_data.redirect_to || ''
  const site_url = email_data.site_url || Deno.env.get('PUBLIC_SITE_URL') || 'https://kohablerjeve.top'

  if (!recipientEmail) {
    return new Response(
      JSON.stringify({ error: 'Missing recipient email in payload' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // N2: Live deployed v19 confirmation link format (/auth/confirm?token_hash=...&type=...&next=...)
  const queryNext = redirect_to ? `&next=${encodeURIComponent(redirect_to)}` : ''
  let confirmUrl = token_hash ? `${site_url}/auth/confirm?token_hash=${token_hash}&type=${emailType}${queryNext}` : ''
  let confirmUrlNew = ''

  if (emailType === 'email_change') {
    confirmUrl = token_hash ? `${site_url}/auth/confirm?token_hash=${token_hash}&type=email_change${queryNext}` : ''
    confirmUrlNew = token_hash_new ? `${site_url}/auth/confirm?token_hash=${token_hash_new}&type=email_change${queryNext}` : ''
  }

  const subject = EMAIL_SUBJECTS[emailType] || `Njoftim nga ${SITE_NAME}`
  const htmlContent = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>${subject}</h2>
      <p>Përshëndetje,</p>
      <p>Kodi yt i verifikimit apo lidhja e aktivizimit:</p>
      ${token ? `<div style="font-size: 24px; font-weight: bold; background: #f4f4f5; padding: 12px; text-align: center; border-radius: 8px;">${token}</div>` : ''}
      ${confirmUrl ? `<p><a href="${confirmUrl}" style="background: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Kliko Këtu Për Verifikim</a></p>` : ''}
      ${confirmUrlNew ? `<p><a href="${confirmUrlNew}" style="background: #16a34a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Konfirmo Emailin e Ri</a></p>` : ''}
    </div>
  `
  const textContent = `${subject}\n\nKodi: ${token}\nVerifikimi: ${confirmUrl}${confirmUrlNew ? `\nVerifikimi i ri: ${confirmUrlNew}` : ''}`

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = getServiceKey()
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!)
  const messageId = crypto.randomUUID()

  // H1: Write-site 1 - Insert pending log and check errors
  const { error: insertErr } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: emailType,
    recipient_email: recipientEmail,
    status: 'pending',
  })
  if (insertErr) {
    console.error('Failed to log pending status to email_send_log', insertErr)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.error('RESEND_API_KEY environment variable missing')
    const { error: failLogErr } = await supabase.from('email_send_log').update({
      status: 'failed',
      error_message: 'RESEND_API_KEY missing',
    }).eq('message_id', messageId)

    if (failLogErr) {
      console.error('Failed to record failure in email_send_log', failLogErr)
    }

    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'RESEND_API_KEY missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const resendResult = await sendViaResendWithRetry(resendApiKey, {
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    to: [recipientEmail],
    subject,
    html: htmlContent,
    text: textContent,
  })

  // H1: Write-site 2 & 3 - Update status and check errors
  const finalStatus = resendResult.ok ? 'sent' : 'failed'
  const { error: updateErr } = await supabase.from('email_send_log').update({
    status: finalStatus,
    sent_at: resendResult.ok ? new Date().toISOString() : null,
    error_message: resendResult.ok ? null : resendResult.text,
  }).eq('message_id', messageId)

  if (updateErr) {
    console.error(`Failed to record ${finalStatus} status in email_send_log`, updateErr)
  }

  if (!resendResult.ok) {
    return new Response(
      JSON.stringify({ success: false, sent: false, error: resendResult.text }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, sent: true, messageId }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
