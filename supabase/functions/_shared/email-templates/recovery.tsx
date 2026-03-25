/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Rivendosni fjalëkalimin tuaj për {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Rivendosni fjalëkalimin</Heading>
        <Text style={text}>
          Kemi marrë një kërkesë për të rivendosur fjalëkalimin tuaj për {siteName}. Klikoni butonin më poshtë për të zgjedhur një fjalëkalim të ri.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Rivendos Fjalëkalimin
        </Button>
        <Text style={footer}>
          Nëse nuk e keni kërkuar rivendosjen e fjalëkalimit, mund ta injoroni këtë email. Fjalëkalimi juaj nuk do të ndryshojë.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
