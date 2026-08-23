import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@6'
import { getServiceKey } from "../_shared/admin-client.ts";

type SuppressionReason = 'bounce' | 'complaint' | 'unsubscribe'

type ResendEvent = {
  type?: string
  created_at?: string
  data?: Record<string, any>
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function resolveSuppression(event: ResendEvent): {
  email: string
  reason: SuppressionReason
  messageId?: string
  metadata: Record<string, unknown>
} | null {
  const data = event.data || {}
  const type = String(event.type || '')
  const recipient = Array.isArray(data.to) ? data.to[0] : data.email
  const email = typeof recipient === 'string' ? recipient.trim().toLowerCase() : ''

  if (type === 'contact.updated') {
    if (!data.unsubscribed || !email) return null
    return {
      email,
      reason: 'unsubscribe',
      messageId: undefined,
      metadata: { provider: 'resend', event_type: type, event_created_at: event.created_at || null },
    }
  }

  if (!email) return null
  const reason: SuppressionReason | null =
    type === 'email.bounced' || type === 'email.suppressed'
      ? 'bounce'
      : type === 'email.complained'
        ? 'complaint'
        : null
  if (!reason) return null

  return {
    email,
    reason,
    messageId: typeof data.email_id === 'string'
      ? data.email_id
      : typeof data.message_id === 'string'
        ? data.message_id
        : undefined,
    metadata: {
      provider: 'resend',
      event_type: type,
      event_created_at: event.created_at || null,
      bounce: data.bounce || null,
      tags: data.tags || null,
    },
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('RESEND_API_KEY') || ''
  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseServiceKey = getServiceKey()
  if (!apiKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Resend webhook or Supabase configuration')
    return jsonResponse({ error: 'Server configuration error' }, 503)
  }

  const rawBody = await req.text()
  let event: ResendEvent
  try {
    const resend = new Resend(apiKey)
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: req.headers.get('svix-id') || '',
        timestamp: req.headers.get('svix-timestamp') || '',
        signature: req.headers.get('svix-signature') || '',
      },
      webhookSecret,
    }) as ResendEvent
  } catch (error) {
    console.error('Invalid Resend webhook signature', { error })
    return jsonResponse({ error: 'Invalid signature' }, 401)
  }

  const suppression = resolveSuppression(event)
  if (!suppression) {
    return jsonResponse({ success: true, ignored: true, event_type: event.type || null })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: suppression.email,
        reason: suppression.reason,
        metadata: suppression.metadata,
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', { error: suppressError })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  const sendLogStatus = suppression.reason === 'bounce'
    ? 'bounced'
    : suppression.reason === 'complaint'
      ? 'complained'
      : 'suppressed'

  const { error: insertError } = await supabase.from('email_send_log').insert({
    message_id: suppression.messageId ?? null,
    template_name: 'system',
    recipient_email: suppression.email,
    status: sendLogStatus,
    error_message: suppression.reason === 'bounce'
      ? 'Email delivery bounced or was provider-suppressed'
      : suppression.reason === 'complaint'
        ? 'Recipient reported the email as spam'
        : 'Recipient unsubscribed',
    metadata: suppression.metadata,
  })
  if (insertError) console.warn('Failed to append email_send_log suppression event', { error: insertError })

  console.log('Suppression processed', {
    reason: suppression.reason,
    event_type: event.type,
    has_message_id: !!suppression.messageId,
  })
  return jsonResponse({ success: true })
})
