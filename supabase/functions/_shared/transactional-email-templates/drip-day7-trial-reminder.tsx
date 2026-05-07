/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Pulse AI'
const APP_URL = 'https://kohablerjeve.top'

interface Props { name?: string; daysLeft?: number }

const Email = ({ name, daysLeft = 0 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your trial ends soon — {daysLeft} day(s) left</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, your trial ends soon` : 'Your trial ends soon'}</Heading>
        <Text style={text}>
          You have <strong>{daysLeft} day{daysLeft === 1 ? '' : 's'}</strong> left on your free trial.
          Pick a plan to keep your inbox, automations and AI replies running without interruption.
        </Text>
        <Button style={button} href={`${APP_URL}/pricing`}>Choose a plan</Button>
        <Text style={text}>
          Not ready yet? Reply and tell us what's missing — we read every email.
        </Text>
        <Text style={footer}>The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Your trial ends in ${d?.daysLeft ?? 0} day(s)`,
  displayName: 'Drip Day 7 — Trial reminder',
  previewData: { name: 'Jane', daysLeft: 1 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(222, 47%, 8%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(220, 12%, 30%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(145, 73%, 49%)', color: 'hsl(222, 47%, 8%)', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 50%)', margin: '32px 0 0' }
