/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Kodi juaj i verifikimit</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Konfirmoni identitetin</Heading>
        <Text style={text}>Përdorni kodin më poshtë për të konfirmuar identitetin tuaj:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Ky kod do të skadojë së shpejti. Nëse nuk e keni kërkuar këtë, mund ta injoroni këtë email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(222, 47%, 8%)',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: 'hsl(220, 12%, 42%)', margin: '30px 0 0' }
