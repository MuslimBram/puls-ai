/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Pulse AI'
const APP_URL = 'https://kohablerjeve.top'

interface Props { name?: string; completedSteps?: number }

const Email = ({ name, completedSteps = 0 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>3 quick wins to unlock today</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Hi ${name},` : 'Hi,'} 3 quick wins for today</Heading>
        <Text style={text}>
          You've completed <strong>{completedSteps}/7</strong> activation steps.
          Here are 3 quick wins (under 5 minutes each) that unlock the biggest value:
        </Text>
        <Text style={text}>
          ⚡ <strong>Add monitoring keywords</strong> — auto-discover leads from conversations<br />
          ⚡ <strong>Train AI with one document</strong> — paste your FAQ or services page<br />
          ⚡ <strong>Create your first automation</strong> — auto-reply to common questions
        </Text>
        <Button style={button} href={`${APP_URL}/dashboard`}>Continue setup</Button>
        <Text style={footer}>Need help? Reply to this email.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: '3 quick wins to unlock today',
  displayName: 'Drip Day 3 — Quick wins',
  previewData: { name: 'Jane', completedSteps: 2 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: 'hsl(222, 47%, 8%)', margin: '0 0 18px' }
const text = { fontSize: '15px', color: 'hsl(220, 12%, 30%)', lineHeight: '1.6', margin: '0 0 20px' }
const button = { backgroundColor: 'hsl(145, 73%, 49%)', color: 'hsl(222, 47%, 8%)', fontSize: '14px', fontWeight: 'bold' as const, borderRadius: '10px', padding: '12px 22px', textDecoration: 'none' }
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 50%)', margin: '32px 0 0' }
