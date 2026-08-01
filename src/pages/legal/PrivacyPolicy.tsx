import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "who-we-are", title: "1. Who we are" },
  { id: "data-we-collect", title: "2. Data we collect" },
  { id: "why", title: "3. Why we process data" },
  { id: "sharing", title: "4. Sharing and processors" },
  { id: "storage", title: "5. Storage and retention" },
  { id: "rights", title: "6. Your GDPR rights" },
  { id: "contact", title: "7. Contact" },
];

const rights = [
  ["Right of access", "Request a copy of the personal data we hold about you. We respond within 30 days."],
  ["Right to rectification", "Correct inaccurate or incomplete data directly in your account settings or by request."],
  ["Right to erasure", "Ask us to delete your account and associated personal data. Data is removed within 30 days, except records we must keep for accounting or fraud-prevention obligations."],
  ["Right to restriction", "Ask us to pause processing while a dispute about accuracy or lawfulness is reviewed."],
  ["Right to data portability", "Export your contacts, conversations and CRM records in a machine-readable format."],
  ["Right to object", "Object to processing based on legitimate interests, including profiling for product analytics."],
  ["Right to withdraw consent", "Withdraw consent for optional processing such as analytics cookies or marketing emails at any time."],
];

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How Pulse AI collects, uses, stores and protects personal data for businesses and their customers."
      description="Pulse AI Privacy Policy: what personal data we collect, why we process it, where it is stored, our processors, and how to exercise your GDPR rights."
      path="/privacy"
      sections={sections}
    >
      <Section id="who-we-are" title="1. Who we are">
        <p>
          Pulse AI is a business operating system that combines CRM, omnichannel inbox, marketing
          automation and AI assistants. For personal data that businesses upload into the platform,
          Pulse AI acts as a data processor and the business acts as the data controller. For account
          and billing data of our own customers, Pulse AI is the controller.
        </p>
        <p>Contact for privacy matters: info@mso.re</p>
      </Section>

      <Section id="data-we-collect" title="2. Data we collect">
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCard title="Account data">
            Name, email address, phone number, password hash, workspace membership, role and
            authentication events such as login device and IP address.
          </InfoCard>
          <InfoCard title="Business content">
            Contacts, leads, deals, conversations from connected channels, knowledge-base documents,
            campaign content and files you upload.
          </InfoCard>
          <InfoCard title="Billing data">
            Plan, invoices and payment status. Card details are handled by our payment providers and
            never stored on Pulse AI servers.
          </InfoCard>
          <InfoCard title="Technical data">
            Log records, error traces, feature usage counters and cookie identifiers described in the
            Cookie Policy.
          </InfoCard>
        </div>
      </Section>

      <Section id="why" title="3. Why we process data">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To provide the service you subscribed to (contract).</li>
          <li>To secure accounts, detect abuse and prevent fraud (legitimate interest).</li>
          <li>To send transactional messages about your account (contract).</li>
          <li>To improve product quality using aggregated usage statistics (legitimate interest).</li>
          <li>To send product news and offers where you opted in (consent).</li>
          <li>To meet accounting and tax obligations (legal obligation).</li>
        </ul>
      </Section>

      <Section id="sharing" title="4. Sharing and processors">
        <p>
          We do not sell personal data. We share data only with authorised sub-processors that are
          required to operate the service, each under a data processing agreement: Supabase
          (database, authentication, storage), Stripe and PayPal (payments), Resend (transactional
          email), Twilio (SMS and voice), Meta and Google (only for channels you explicitly connect),
          and AI providers used to generate assistant replies.
        </p>
        <p>
          Data may also be disclosed where required by a valid legal request, or during a merger or
          acquisition, in which case you will be notified in advance.
        </p>
      </Section>

      <Section id="storage" title="5. Storage and retention">
        <p>
          Production data is hosted in the European Union (Frankfurt region). Data is encrypted in
          transit with TLS 1.2+ and at rest, with sensitive credentials stored using AES-256-GCM
          encryption. Row Level Security isolates each workspace at the database level.
        </p>
        <p>
          Active account data is retained while your subscription is active. After account deletion,
          personal data is removed within 30 days; backups roll off within 90 days. Invoices are kept
          for the period required by tax law.
        </p>
      </Section>

      <Section id="rights" title="6. Your GDPR rights">
        <p>
          If you are in the European Economic Area, you have the rights below. To exercise any of
          them, email info@mso.re from the address linked to your account.
        </p>
        <Accordion type="single" collapsible className="w-full">
          {rights.map(([title, body]) => (
            <AccordionItem key={title} value={title}>
              <AccordionTrigger className="text-left text-foreground">{title}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{body}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p>
          You also have the right to lodge a complaint with your national data protection authority.
        </p>
      </Section>

      <Section id="contact" title="7. Contact">
        <p>
          Questions about this policy, or a request relating to your data: info@mso.re. We reply
          within 30 days, and sooner where the law requires it.
        </p>
      </Section>
    </LegalLayout>
  );
}
