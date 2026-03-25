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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Konfirmoni email-in tuaj për {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Konfirmoni email-in tuaj</Heading>
        <Text style={text}>
          Faleminderit që u regjistruat në{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          !
        </Text>
        <Text style={text}>
          Ju lutemi konfirmoni adresën tuaj të email-it (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) duke klikuar butonin më poshtë:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verifiko Email-in
        </Button>
        <Text style={footer}>
          Nëse nuk keni krijuar një llogari, mund ta injoroni këtë email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
