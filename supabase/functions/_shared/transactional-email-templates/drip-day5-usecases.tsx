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
    <Preview>How real businesses use {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, see what's possible` : "See what's possible"}</Heading>
        <Text style={text}>
          Here are 3 ways customers use {SITE_NAME} to save 10+ hours per week:
        </Text>
        <Text style={text}>
          🍽 <strong>Restaurants</strong> — Auto-reply to reservation requests on Instagram + WhatsApp, route VIPs to staff<br /><br />
          🛍 <strong>E-commerce</strong> — Recover abandoned carts via DM, qualify leads from comments automatically<br /><br />
          💼 <strong>Agencies</strong> — Unified inbox across 5+ channels, AI drafts every reply with your tone
        </Text>
        <Button style={button} href={`${APP_URL}/dashboard`}>Open my workspace</Button>
        <Text style={footer}>Pick one workflow and we'll help you set it up.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `How real businesses use ${SITE_NAME}`,
  displayName: 'Drip Day 5 — Use cases',
  previewData: { name: 'Jane' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(222, 47%, 8%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(220, 12%, 30%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(145, 73%, 49%)', color: 'hsl(222, 47%, 8%)', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 50%)', margin: '32px 0 0' }
