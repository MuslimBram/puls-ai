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

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Konfirmoni ndryshimin e email-it për {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Konfirmoni ndryshimin e email-it</Heading>
        <Text style={text}>
          Keni kërkuar të ndryshoni adresën e email-it tuaj për {siteName} nga{' '}
          <Link href={`mailto:${email}`} style={link}>
            {email}
          </Link>{' '}
          në{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>
          Klikoni butonin më poshtë për të konfirmuar këtë ndryshim:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Konfirmo Ndryshimin
        </Button>
        <Text style={footer}>
          Nëse nuk e keni kërkuar këtë ndryshim, ju lutemi siguroni llogarinë tuaj menjëherë.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
