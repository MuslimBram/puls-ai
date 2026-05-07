/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Pulse AI'
const APP_URL = 'https://kohablerjeve.top'

interface Props { name?: string; extraDays?: number; newEndDate?: string }

const Email = ({ name, extraDays = 7, newEndDate }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We extended your trial by {extraDays} days</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Good news, ${name}!` : 'Good news!'}</Heading>
        <Text style={text}>
          We noticed you didn't get to fully explore {SITE_NAME}, so we extended
          your trial by <strong>{extraDays} more days</strong>{newEndDate ? ` (now ending ${newEndDate})` : ''}.
        </Text>
        <Text style={text}>
          Want a free 1-on-1 setup call? Reply to this email — we'll help you connect your channels and launch your first automation.
        </Text>
        <Button style={button} href={`${APP_URL}/dashboard`}>Continue where I left off</Button>
        <Text style={footer}>The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `We extended your trial by ${d?.extraDays ?? 7} days 🎁`,
  displayName: 'Trial extended',
  previewData: { name: 'Jane', extraDays: 7, newEndDate: '2026-05-21' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(222, 47%, 8%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(220, 12%, 30%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(145, 73%, 49%)', color: 'hsl(222, 47%, 8%)', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 50%)', margin: '32px 0 0' }
