/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Pulse AI'
const APP_URL = 'https://pulse-bos.com'

interface Props { name?: string }

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your 10-minute quick start</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Welcome, ${name}!` : 'Welcome!'}</Heading>
        <Text style={text}>
          You just joined {SITE_NAME} — a unified workspace for messages, leads,
          AI replies and automations. In the next 10 minutes you can already see real value:
        </Text>
        <Text style={text}>
          1. Complete your business profile (so AI knows your tone)<br />
          2. Connect a channel (Telegram, Email or WhatsApp)<br />
          3. Send your first AI-assisted reply
        </Text>
        <Button style={button} href={`${APP_URL}/dashboard`}>Open my dashboard</Button>
        <Text style={footer}>The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Welcome to ${SITE_NAME} — quick start in 10 minutes`,
  displayName: 'Drip Day 1 — Welcome',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: 'hsl(222, 47%, 8%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(220, 12%, 30%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(145, 73%, 49%)', color: 'hsl(222, 47%, 8%)', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 50%)', margin: '32px 0 0' }
