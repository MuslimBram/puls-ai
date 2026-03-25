/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Jeni ftuar të bashkoheni me {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Jeni ftuar</Heading>
        <Text style={text}>
          Jeni ftuar të bashkoheni me{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Klikoni butonin më poshtë për të pranuar ftesën dhe krijuar llogarinë tuaj.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Prano Ftesën
        </Button>
        <Text style={footer}>
          Nëse nuk e prisnit këtë ftesë, mund ta injoroni këtë email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(222, 47%, 8%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(220, 12%, 42%)',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(145, 73%, 49%)',
  color: 'hsl(222, 47%, 8%)',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '0.625rem',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 42%)', margin: '30px 0 0' }
