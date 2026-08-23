import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { getServiceKey } from "../_shared/admin-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, webhook-id, webhook-signature, webhook-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = "Pulse AI"
const SENDER_DOMAIN = Deno.env.get('EMAIL_SENDER_DOMAIN') || "notify.kohablerjeve.top"
const FROM_DOMAIN = Deno.env.get('EMAIL_FROM_DOMAIN') || SENDER_DOMAIN
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || "https://pulse-bos.com"
const SAMPLE_EMAIL = "user@example.test"
const SAMPLE_DATA: Record<string, object> = {
  signup: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, recipient: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL },
  magiclink: { siteName: SITE_NAME, confirmationUrl: PUBLIC_SITE_URL },
  recovery: { siteName: SITE_NAME, confirmationUrl: PUBLIC_SITE_URL },
  invite: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, confirmationUrl: PUBLIC_SITE_URL },
  email_change: { siteName: SITE_NAME, email: SAMPLE_EMAIL, newEmail: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL },
  reauthentication: { token: '123456' },
}

type HookUser = {
  id?: string
  email?: string
  new_email?: string
}

type HookEmailData = {
  token?: string
  token_hash?: string
  redirect_to?: string
  email_action_type?: string
  site_url?: string
  token_new?: string
  token_hash_new?: string
  old_email?: string
}

type HookPayload = {
  user: HookUser
  email_data: HookEmailData
}

type OutgoingAuthEmail = {
  recipient: string
  emailType: string
  token: string
  tokenHash: string
}

function normalizeHookSecret(raw: string): string {
  return raw.replace(/^v1,whsec_/, '')
}

function confirmationUrl(tokenHash: string, actionType: string, redirectTo?: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const redirect = redirectTo || PUBLIC_SITE_URL
  return `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(actionType)}&redirect_to=${encodeURIComponent(redirect)}`
}

function resolveOutgoingEmails(payload: HookPayload): OutgoingAuthEmail[] {
  const user = payload.user || {}
  const data = payload.email_data || {}
  const emailType = String(data.email_action_type || '')
  const currentEmail = String(user.email || '')
  const newEmail = String(user.new_email || '')

  if (!emailType) throw new Error('email_action_type missing')

  if (emailType === 'email_change') {
    const outgoing: OutgoingAuthEmail[] = []

    // Secure Email Change: Supabase intentionally maps token_hash_new to the
    // current email and token_hash to the new email for backward compatibility.
    if (currentEmail && data.token && data.token_hash_new) {
      outgoing.push({
        recipient: currentEmail,
        emailType,
        token: String(data.token),
        tokenHash: String(data.token_hash_new),
      })
    }
    if (newEmail && data.token_new && data.token_hash) {
      outgoing.push({
        recipient: newEmail,
        emailType,
        token: String(data.token_new),
        tokenHash: String(data.token_hash),
      })
    }

    if (outgoing.length > 0) return outgoing

    // Non-secure email change: send the available token/hash pair to new email.
    const recipient = newEmail || currentEmail
    const token = String(data.token_new || data.token || '')
    const tokenHash = String(data.token_hash || '')
    if (!recipient || !tokenHash) throw new Error('email_change payload missing recipient or token hash')
    return [{ recipient, emailType, token, tokenHash }]
  }

  if (!currentEmail) throw new Error('user.email missing')
  const token = String(data.token || '')
  const tokenHash = String(data.token_hash || '')
  if (emailType !== 'reauthentication' && !tokenHash) throw new Error('token_hash missing')
  return [{ recipient: currentEmail, emailType, token, tokenHash }]
}

async function handlePreview(req: Request): Promise<Response> {
  const previewHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  const previewSecret = Deno.env.get('EMAIL_PREVIEW_SECRET') || Deno.env.get('INTERNAL_WEBHOOK_SECRET') || ''
  const authHeader = req.headers.get('Authorization') || ''
  if (!previewSecret || authHeader !== `Bearer ${previewSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type = ''
  try { type = String((await req.json()).type || '') }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewHeaders, 'Content-Type': 'application/json' },
    })
  }

  const html = await renderAsync(React.createElement(EmailTemplate, SAMPLE_DATA[type] || {}))
  return new Response(html, {
    status: 200,
    headers: { ...previewHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function enqueueAuthEmail(
  supabase: ReturnType<typeof createClient>,
  hookId: string,
  outgoing: OutgoingAuthEmail,
  payload: HookPayload,
) {
  const EmailTemplate = EMAIL_TEMPLATES[outgoing.emailType]
  if (!EmailTemplate) throw new Error(`Unknown email type: ${outgoing.emailType}`)

  const data = payload.email_data || {}
  const targetUrl = outgoing.emailType === 'reauthentication'
    ? PUBLIC_SITE_URL
    : confirmationUrl(outgoing.tokenHash, outgoing.emailType, data.redirect_to)

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: data.site_url || PUBLIC_SITE_URL,
    recipient: outgoing.recipient,
    confirmationUrl: targetUrl,
    token: outgoing.token,
    email: payload.user.email || outgoing.recipient,
    newEmail: payload.user.new_email || outgoing.recipient,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), { plainText: true })
  const messageId = crypto.randomUUID()

  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: outgoing.emailType,
    recipient_email: outgoing.recipient,
    status: 'pending',
  })

  const { error } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      run_id: hookId,
      message_id: messageId,
      to: outgoing.recipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: EMAIL_SUBJECTS[outgoing.emailType] || 'Notification',
      html,
      text,
      purpose: 'transactional',
      label: outgoing.emailType,
      idempotency_key: `auth/${hookId}/${outgoing.recipient}/${outgoing.emailType}`,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: outgoing.emailType,
      recipient_email: outgoing.recipient,
      status: 'failed',
      error_message: 'Failed to enqueue auth email',
    })
    throw error
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  const rawSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') || ''
  if (!rawSecret) {
    console.error('SEND_EMAIL_HOOK_SECRET not configured')
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rawBody = await req.text()
  let payload: HookPayload
  try {
    const verifier = new Webhook(normalizeHookSecret(rawSecret))
    payload = verifier.verify(rawBody, Object.fromEntries(req.headers)) as HookPayload
  } catch (error) {
    console.error('Supabase send-email hook verification failed', { error })
    return new Response(JSON.stringify({ error: 'Invalid webhook signature or payload' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const outgoingEmails = resolveOutgoingEmails(payload)
  const hookId = req.headers.get('webhook-id') || crypto.randomUUID()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, getServiceKey()!)

  for (const outgoing of outgoingEmails) {
    await enqueueAuthEmail(supabase, hookId, outgoing, payload)
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  try {
    return url.pathname.endsWith('/preview') ? await handlePreview(req) : await handleWebhook(req)
  } catch (error) {
    console.error('Auth email hook error', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
