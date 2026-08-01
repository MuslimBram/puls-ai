import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "timeline", title: "1. Refund timeline" },
  { id: "eligible", title: "2. What is refundable" },
  { id: "not-eligible", title: "3. What is not refundable" },
  { id: "third-party", title: "4. Third-party charges" },
  { id: "cancellation", title: "5. Cancelling a subscription" },
  { id: "how", title: "6. How to request a refund" },
];

const timeline = [
  ["Days 0–7", "First subscription payment", "Full refund if the platform did not work as described due to our fault."],
  ["Days 8–30", "Current billing period", "Case-by-case review for verified billing errors or outages longer than 48 continuous hours."],
  ["After 30 days", "Past periods", "Not refundable. You can cancel to stop the next renewal."],
];

export default function RefundPolicy() {
  return (
    <LegalLayout
      title="Refund & Cancellation"
      subtitle="When a Pulse AI subscription payment can be refunded, what falls outside our control, and how to cancel."
      description="Pulse AI refund and cancellation policy: 7-day first-payment refund window, billing-error refunds, third-party charges, and how to cancel a subscription."
      path="/refund"
      sections={sections}
    >
      <Section id="timeline" title="1. Refund timeline">
        <ol className="relative border-l border-border pl-6 space-y-6">
          {timeline.map(([period, scope, body]) => (
            <li key={period}>
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" />
              <div className="font-medium text-foreground">{period}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{scope}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="eligible" title="2. What is refundable">
        <InfoCard title="Eligible scenarios" tone="positive">
          <ul className="list-disc pl-5 space-y-1">
            <li>The first subscription payment within 7 days if the platform did not work due to our fault.</li>
            <li>The unused period when Pulse AI has downtime longer than 48 continuous hours.</li>
            <li>Verified billing errors such as duplicate charges or an incorrect amount.</li>
          </ul>
        </InfoCard>
      </Section>

      <Section id="not-eligible" title="3. What is not refundable">
        <InfoCard title="Not eligible" tone="warning">
          <ul className="list-disc pl-5 space-y-1">
            <li>Payments made to third-party platforms (Meta Ads, Google Ads, Twilio, Resend, payment fees).</li>
            <li>Monthly subscription fees after day 7 of the first payment.</li>
            <li>Usage-based costs already consumed, such as AI calls, SMS and email sends.</li>
            <li>Periods where access was active but unused.</li>
          </ul>
        </InfoCard>
      </Section>

      <Section id="third-party" title="4. Third-party charges">
        <p>
          Ad budgets and messaging fees are a direct relationship between your business and those
          providers. Refund requests for those amounts must be made to the provider; Pulse AI has no
          authority over them and only synchronises the resulting statistics.
        </p>
      </Section>

      <Section id="cancellation" title="5. Cancelling a subscription">
        <p>
          You can cancel at any time from the billing page. There is no cancellation fee. Access
          continues until the end of the paid period, after which the account moves to read-only. You
          can export your data for 30 days before deletion.
        </p>
      </Section>

      <Section id="how" title="6. How to request a refund">
        <p>
          Email info@mso.re with your workspace name, invoice number and a short description of the
          issue. We acknowledge within two business days and, where approved, refunds are returned to
          the original payment method within 5–10 banking days.
        </p>
      </Section>
    </LegalLayout>
  );
}
