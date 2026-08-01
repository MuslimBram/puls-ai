import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "agreement", title: "1. The agreement" },
  { id: "accounts", title: "2. Accounts and eligibility" },
  { id: "plans", title: "3. Plans, trial and billing" },
  { id: "acceptable-use", title: "4. Acceptable use" },
  { id: "third-party", title: "5. Third-party platforms" },
  { id: "ai", title: "6. AI-generated output" },
  { id: "ip", title: "7. Intellectual property" },
  { id: "liability", title: "8. Liability and warranties" },
  { id: "termination", title: "9. Suspension and termination" },
  { id: "law", title: "10. Governing law and changes" },
];

export default function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The rules that govern your use of Pulse AI, including subscriptions, acceptable use and liability."
      description="Pulse AI Terms of Service: account rules, subscription and billing terms, acceptable use, third-party platform costs, AI output, liability and termination."
      path="/terms"
      sections={sections}
    >
      <Section id="agreement" title="1. The agreement">
        <p>
          These terms form a binding agreement between Pulse AI and the person or company using the
          platform. By creating an account or clicking "Start free trial" you accept them. If you
          accept on behalf of a company, you confirm you are authorised to do so.
        </p>
      </Section>

      <Section id="accounts" title="2. Accounts and eligibility">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>You must be at least 18 years old and provide accurate registration details.</li>
          <li>Email verification is mandatory before full access is granted.</li>
          <li>You are responsible for the activity of every user you invite to your workspace.</li>
          <li>Credentials must not be shared; sessions expire automatically after 24 hours.</li>
        </ul>
      </Section>

      <Section id="plans" title="3. Plans, trial and billing">
        <InfoCard title="Key billing terms" tone="positive">
          <ul className="list-disc pl-5 space-y-1">
            <li>Every new business gets a 7-day free trial with full functionality.</li>
            <li>Subscriptions renew automatically until cancelled.</li>
            <li>Prices are shown excluding VAT where applicable.</li>
            <li>Cancellation stops the next renewal; access continues until the period ends.</li>
          </ul>
        </InfoCard>
        <p>
          Refunds are governed by our Refund &amp; Cancellation policy. Failure to pay may lead to
          suspension after a grace period and deletion of unpaid accounts after 30 days.
        </p>
      </Section>

      <Section id="acceptable-use" title="4. Acceptable use">
        <p>You may not use Pulse AI to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Send unsolicited bulk messages or violate messaging-platform policies.</li>
          <li>Upload unlawful, infringing or harmful content.</li>
          <li>Attempt to bypass access controls, rate limits or workspace isolation.</li>
          <li>Resell the platform without a written reseller agreement.</li>
          <li>Process special-category personal data without an appropriate legal basis.</li>
        </ul>
      </Section>

      <Section id="third-party" title="5. Third-party platforms">
        <InfoCard title="Two-tier cost structure" tone="warning">
          Your Pulse AI subscription covers the platform only. Ad budgets (Meta, Google), messaging
          fees (WhatsApp templates, Twilio SMS and voice), email volume above the free tier and
          payment-processing fees are billed directly by those companies and are outside our control.
        </InfoCard>
      </Section>

      <Section id="ai" title="6. AI-generated output">
        <p>
          AI features produce suggestions that may be inaccurate. You remain responsible for
          reviewing content before it is sent to customers or used for a business decision. We do not
          guarantee any specific commercial result from using the platform.
        </p>
      </Section>

      <Section id="ip" title="7. Intellectual property">
        <p>
          Pulse AI owns the platform, its software and branding. You keep ownership of the data and
          content you upload, and grant us the limited licence needed to host and process it in order
          to deliver the service.
        </p>
      </Section>

      <Section id="liability" title="8. Liability and warranties">
        <p>
          The service is provided on an "as is" basis with commercially reasonable effort towards
          availability. To the maximum extent permitted by law, our aggregate liability is limited to
          the subscription fees you paid in the twelve months preceding the claim. We are not liable
          for indirect or consequential loss, including lost profits or costs charged by third-party
          platforms.
        </p>
      </Section>

      <Section id="termination" title="9. Suspension and termination">
        <p>
          You may cancel at any time from the billing page. We may suspend or terminate accounts that
          breach these terms, create security risk, or remain unpaid. On termination you can export
          your data for 30 days, after which it is deleted.
        </p>
      </Section>

      <Section id="law" title="10. Governing law and changes">
        <p>
          These terms are governed by the laws of the Republic of Albania, with the courts of Tirana
          having jurisdiction, without prejudice to mandatory consumer protections in your country of
          residence. Material changes are announced by email at least 14 days before taking effect.
        </p>
      </Section>
    </LegalLayout>
  );
}
