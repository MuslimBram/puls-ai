import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { getServiceKey } from "../_shared/admin-client.ts"
import { requireCronAuth } from "../_shared/cron-auth.ts"

// Configuration baked in at scaffold time — do NOT change these manually.
const SITE_NAME = "Pulse AI"
const SENDER_DOMAIN = Deno.env.get("EMAIL_SENDER_DOMAIN") || "pulse-bos.com"
const FROM_DOMAIN = Deno.env.get("EMAIL_FROM_DOMAIN") || SENDER_DOMAIN

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const SEQUENCE_TEMPLATE_NAME = 'sequence-step'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

async function sendViaSink(
  sinkUrl: string,
  payload: { from: string; to: string[]; subject: string; html: string; text: string }
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const res = await fetch(sinkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return { ok: res.ok, status: res.status, text: await res.text() }
  } catch (err) {
    return { ok: false, status: 500, text: err instanceof Error ? err.message : 'Sink fetch error' }
  }
}

function getSinkUrl(): string | null {
  const sinkUrl = Deno.env.get('EMAIL_SINK_URL')
  if (!sinkUrl) return null

  try {
    const url = new URL(sinkUrl)
    return url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Security Hardening: Enforce cron authentication
  const cronAuthErr = requireCronAuth(req)
  if (cronAuthErr) {
    return new Response(cronAuthErr.body, {
      status: cronAuthErr.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = getServiceKey()

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let sequenceContent: { subject: string; html: string; text: string } | null = null
  let isWorkerBatch = false

  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    idempotencyKey = body.idempotencyKey || body.idempotency_key || crypto.randomUUID()
    messageId = idempotencyKey
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    if (templateName === SEQUENCE_TEMPLATE_NAME) {
      if (
        typeof body.subject !== 'string' ||
        typeof body.html !== 'string' ||
        typeof body.text !== 'string' ||
        !body.subject.trim() ||
        !body.html.trim() ||
        !body.text.trim()
      ) {
        return new Response(
          JSON.stringify({ error: 'sequence-step requires non-empty subject, html, and text' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      sequenceContent = { subject: body.subject, html: body.html, text: body.text }
    }
    if (body.process_queue || body.worker) {
      isWorkerBatch = true
    }
  } catch {
    // If empty body, assume worker loop trigger
    isWorkerBatch = true
    templateName = ''
    recipientEmail = ''
    idempotencyKey = crypto.randomUUID()
    messageId = idempotencyKey
  }

  // N3: Cron 16 Worker Processing Mode for broadcast_send_queue
  if (isWorkerBatch || (!templateName && !recipientEmail)) {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const nowIso = now.toISOString()

    // N3 Retry & Scheduling: Fetch pending items where scheduled_send_at <= now AND (next_retry_at IS NULL OR next_retry_at <= now)
    const { data: queuedItems, error: queueError } = await supabase
      .from('broadcast_send_queue')
      .select('*')
      .eq('status', 'pending')
      .or(`scheduled_send_at.is.null,scheduled_send_at.lte.${nowIso}`)
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .limit(20)

    if (queueError && queueError.code !== '42P01') {
      console.error('Worker error fetching broadcast_send_queue', queueError)
    }

    let processedCount = 0
    if (queuedItems && queuedItems.length > 0) {
      for (const item of queuedItems) {
        // N3: 1. Channel check - DO NOT send SMS/WhatsApp as email
        const channel = (item.channel_type || 'email').toLowerCase().trim()
        if (channel !== 'email') {
          console.log(`Skipping non-email channel item (${channel})`, item.id)
          continue
        }

        // N3: 2. Scheduled send check - DO NOT send early if scheduled in future
        if (item.scheduled_send_at && new Date(item.scheduled_send_at) > now) {
          console.log(`Skipping future scheduled item (scheduled=${item.scheduled_send_at})`, item.id)
          continue
        }

        // N3: 3. Retry backoff check - DO NOT process early if next_retry_at in future
        if (item.next_retry_at && new Date(item.next_retry_at) > now) {
          console.log(`Skipping item waiting for retry backoff (next_retry_at=${item.next_retry_at})`, item.id)
          continue
        }

        // N3: 4. Retry limits check - DO NOT process if attempt_count >= max_attempts
        const attempts = item.attempt_count || 0
        const maxAttempts = item.max_attempts || 3
        if (attempts >= maxAttempts) {
          console.warn(`Item reached max_attempts (${attempts}/${maxAttempts})`, item.id)
          await supabase.from('broadcast_send_queue').update({ status: 'failed', updated_at: nowIso }).eq('id', item.id)
          continue
        }

        // N3: 5. Atomic conditional claim - pending -> processing ONLY if still pending
        const { data: claimed, error: claimErr } = await supabase
          .from('broadcast_send_queue')
          .update({
            status: 'processing',
            attempt_count: attempts + 1,
            updated_at: nowIso,
          })
          .eq('id', item.id)
          .eq('status', 'pending')
          .select('id')

        if (claimErr || !claimed || claimed.length === 0) {
          // Double-claim prevented by conditional update
          continue
        }

        // N3 Content: Query broadcasts table ONLY using real live columns: subject, message_content
        let subject = item.subject || 'Broadcast Notification'
        let contentHtml = item.personalized_content || item.body_html || item.html || `<p>${item.body_text || 'Notification'}</p>`
        let contentText = item.body_text || 'Notification'

        if (item.broadcast_id) {
          const { data: bData } = await supabase
            .from('broadcasts')
            .select('subject, message_content')
            .eq('id', item.broadcast_id)
            .maybeSingle()

          if (bData) {
            subject = bData.subject || subject
            if (!item.personalized_content && bData.message_content) {
              contentHtml = bData.message_content
              contentText = bData.message_content
            }
          }
        }

        const normEmail = (item.contact_identifier || item.recipient_email || item.email || '').toLowerCase().trim()
        if (!normEmail) {
          await supabase.from('broadcast_send_queue').update({ status: 'failed', updated_at: nowIso }).eq('id', item.id)
          continue
        }

        // Fail-closed suppression check
        const { data: supp, error: sErr } = await supabase
          .from('suppressed_emails')
          .select('id')
          .eq('email', normEmail)
          .maybeSingle()

        if (sErr || supp) {
          await supabase
            .from('broadcast_send_queue')
            .update({ status: sErr ? 'failed' : 'suppressed', updated_at: nowIso })
            .eq('id', item.id)

          const { error: logErr } = await supabase.from('email_send_log').insert({
            message_id: item.id || crypto.randomUUID(),
            template_name: 'broadcast',
            recipient_email: normEmail,
            status: sErr ? 'failed' : 'suppressed',
            error_message: sErr ? 'Suppression lookup error' : 'Recipient suppressed',
          })
          if (logErr) {
            console.error('Failed to log suppression status to email_send_log', logErr)
          }
          continue
        }

        const resResult = await sendViaResendWithRetry(resendApiKey, {
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          to: [normEmail],
          subject,
          html: contentHtml,
          text: contentText,
        })

        // N3 Retry Logic: On transient failure, set status = 'pending' and next_retry_at = future backoff if attempts + 1 < maxAttempts
        const newAttempts = attempts + 1
        let finalStatus = 'failed'
        let nextRetryAt: string | null = null

        if (resResult.ok) {
          finalStatus = 'sent'
        } else if (newAttempts < maxAttempts) {
          finalStatus = 'pending'
          // Exponential backoff: 1 minute * newAttempts
          const backoffMs = Math.pow(2, newAttempts - 1) * 60 * 1000
          nextRetryAt = new Date(Date.now() + backoffMs).toISOString()
        }

        await supabase
          .from('broadcast_send_queue')
          .update({
            status: finalStatus,
            next_retry_at: nextRetryAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)

        // H1: Write-site for worker send log and check errors
        const { error: sendLogErr } = await supabase.from('email_send_log').insert({
          message_id: item.id || crypto.randomUUID(),
          template_name: 'broadcast',
          recipient_email: normEmail,
          status: resResult.ok ? 'sent' : finalStatus,
          sent_at: resResult.ok ? new Date().toISOString() : null,
          error_message: resResult.ok ? null : resResult.text,
        })

        if (sendLogErr) {
          console.error('Failed to write worker log to email_send_log', sendLogErr)
        }

        processedCount++
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: processedCount, mode: 'worker' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Look up template from registry
  const template = TEMPLATES[templateName]
  if (!template && templateName !== SEQUENCE_TEMPLATE_NAME) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Unknown template '${templateName}'. Valid templates: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Idempotency Check: Prevent duplicate sends
  if (idempotencyKey) {
    const { data: existingLog } = await supabase
      .from('email_send_log')
      .select('message_id, status')
      .eq('message_id', idempotencyKey)
      .maybeSingle()

    if (existingLog && (existingLog.status === 'sent' || existingLog.status === 'pending')) {
      console.log('Duplicate email dispatch blocked by idempotency check', { idempotencyKey })
      return new Response(
        JSON.stringify({ success: true, sent: false, duplicate: true, messageId: existingLog.message_id }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // Resolve recipient email
  let effectiveRecipient = recipientEmail

  if (!effectiveRecipient && templateData.user_id) {
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(templateData.user_id)
    if (userError || !userData?.user?.email) {
      console.error('Failed to resolve recipient from user_id', {
        user_id: templateData.user_id,
        error: userError,
      })
      return new Response(
        JSON.stringify({
          error: `Could not resolve email for user_id '${templateData.user_id}'`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    effectiveRecipient = userData.user.email
  }

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error:
          'recipientEmail is required (or user_id in templateData to resolve)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Fail-Closed Suppression Check: verify recipient hasn't unsubscribed or been suppressed
  const normalizedEmail = effectiveRecipient.toLowerCase().trim()
  const { data: suppressed, error: suppErr } = await supabase
    .from('suppressed_emails')
    .select('id, reason')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (suppErr) {
    console.error('Database failure during suppression lookup', suppErr)
    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'Database failure during suppression lookup' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    console.log('Email suppressed (unsubscribed / bounced / complained recipient)', {
      email: normalizedEmail,
      templateName,
      reason: suppressed.reason,
    })
    const { error: suppLogErr } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
      error_message: `Recipient suppressed: ${suppressed.reason || 'unsubscribed'}`,
    })
    if (suppLogErr) {
      console.error('Failed to record suppression in email_send_log', suppLogErr)
    }

    return new Response(
      JSON.stringify({ success: false, sent: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Unsubscribe Token Race Condition - Upsert + Re-read canonical token
  let unsubscribeToken: string
  const { data: existingToken, error: tokenLookupErr } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (tokenLookupErr) {
    console.error('Database failure during unsubscribe token lookup', tokenLookupErr)
    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'Database failure during unsubscribe token lookup' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (existingToken && !existingToken.used_at) {
    unsubscribeToken = existingToken.token
  } else if (!existingToken) {
    unsubscribeToken = generateToken()
    const { error: tokenError } = await supabase
      .from('email_unsubscribe_tokens')
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: 'email', ignoreDuplicates: true }
      )

    if (tokenError) {
      console.error('Failed to create unsubscribe token', { error: tokenError })
      const { error: logErr } = await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to create unsubscribe token',
      })
      if (logErr) console.error('Failed to record failure in email_send_log', logErr)

      return new Response(
        JSON.stringify({ success: false, sent: false, error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const { data: storedToken, error: reReadError } = await supabase
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (reReadError || !storedToken) {
      console.error('Failed to read back unsubscribe token after upsert', { error: reReadError, email: normalizedEmail })
      const { error: logErr } = await supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: 'failed',
        error_message: 'Failed to confirm unsubscribe token storage',
      })
      if (logErr) console.error('Failed to record failure in email_send_log', logErr)

      return new Response(
        JSON.stringify({ success: false, sent: false, error: 'Failed to prepare email' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    unsubscribeToken = storedToken.token
  } else {
    return new Response(
      JSON.stringify({ success: false, sent: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Render React Email template to HTML and plain text
  const html = sequenceContent
    ? sequenceContent.html
    : await renderAsync(React.createElement(template!.component, templateData))
  const plainText = sequenceContent
    ? sequenceContent.text
    : await renderAsync(React.createElement(template!.component, templateData), { plainText: true })
  const resolvedSubject = sequenceContent
    ? sequenceContent.subject
    : typeof template!.subject === 'function'
      ? template!.subject(templateData)
      : template!.subject

  // H1: Write-site 1 - Insert pending log and check error
  const { error: pendingLogErr } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })
  if (pendingLogErr) {
    console.error('Failed to insert pending log into email_send_log', pendingLogErr)
  }

  const deliveryMode = Deno.env.get('EMAIL_DELIVERY_MODE') || 'resend'
  const sinkUrl = deliveryMode === 'sink' ? getSinkUrl() : null

  if (deliveryMode !== 'resend' && deliveryMode !== 'sink') {
    console.error('Unsupported EMAIL_DELIVERY_MODE', { deliveryMode })
    const { error: failLogErr } = await supabase.from('email_send_log').update({
      status: 'failed',
      error_message: 'Unsupported EMAIL_DELIVERY_MODE',
    }).eq('message_id', messageId)

    if (failLogErr) {
      console.error('Failed to record failure in email_send_log', failLogErr)
    }

    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'Server configuration error: unsupported delivery mode' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (deliveryMode === 'sink' && !sinkUrl) {
    console.error('EMAIL_SINK_URL must be a valid HTTP URL when sink delivery mode is enabled')
    const { error: failLogErr } = await supabase.from('email_send_log').update({
      status: 'failed',
      error_message: 'EMAIL_SINK_URL missing or invalid',
      metadata: { delivery_mode: 'sink' },
    }).eq('message_id', messageId)

    if (failLogErr) {
      console.error('Failed to record failure in email_send_log', failLogErr)
    }

    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'Server configuration error: EMAIL_SINK_URL missing or invalid' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const payload = {
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    to: [effectiveRecipient],
    subject: resolvedSubject,
    html,
    text: plainText,
  }
  let deliveryResult: { ok: boolean; status: number; text: string }

  if (deliveryMode === 'sink') {
    deliveryResult = await sendViaSink(sinkUrl!, payload)
  } else {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable missing')
      const { error: failLogErr } = await supabase.from('email_send_log').update({
        status: 'failed',
        error_message: 'RESEND_API_KEY environment variable missing',
      }).eq('message_id', messageId)

      if (failLogErr) {
        console.error('Failed to record failure in email_send_log', failLogErr)
      }

      return new Response(
        JSON.stringify({ success: false, sent: false, error: 'Server configuration error: RESEND_API_KEY missing' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    deliveryResult = await sendViaResendWithRetry(resendApiKey, payload)
  }

  // H1: Write-site 2 & 3 - Update status and check error
  const finalStatus = deliveryResult.ok ? 'sent' : 'failed'
  const { error: updateStatusErr } = await supabase.from('email_send_log').update({
    status: finalStatus,
    sent_at: deliveryResult.ok ? new Date().toISOString() : null,
    error_message: deliveryResult.ok ? null : deliveryResult.text,
    metadata: deliveryMode === 'sink'
      ? { delivery_mode: 'sink', sink_status: deliveryResult.status, sink_response: deliveryResult.text }
      : undefined,
  }).eq('message_id', messageId)

  if (updateStatusErr) {
    console.error(`Failed to record ${finalStatus} status in email_send_log`, updateStatusErr)
  }

  if (!deliveryResult.ok) {
    return new Response(
      JSON.stringify({ success: false, sent: false, error: 'Failed to send transactional email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  console.log('Transactional email processed', { templateName, effectiveRecipient })

  return new Response(
    JSON.stringify({ success: true, sent: true, messageId }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
