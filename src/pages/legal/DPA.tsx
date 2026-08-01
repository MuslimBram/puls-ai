import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "parties", title: "1. Parties and scope" },
  { id: "subject", title: "2. Subject matter of processing" },
  { id: "obligations", title: "3. Processor obligations" },
  { id: "subprocessors", title: "4. Sub-processors" },
  { id: "security", title: "5. Technical and organisational measures" },
  { id: "transfers", title: "6. International transfers" },
  { id: "breach", title: "7. Breach notification" },
  { id: "deletion", title: "8. Return and deletion" },
  { id: "audit", title: "9. Audits" },
];

const subprocessors = [
  ["Supabase", "Database, authentication, storage, functions", "EU (Frankfurt)"],
  ["Stripe / PayPal", "Payment processing", "EU / US (SCCs)"],
  ["Resend", "Transactional email delivery", "EU / US (SCCs)"],
  ["Twilio", "SMS and voice", "EU / US (SCCs)"],
  ["Meta / Google", "Channels and ads you explicitly connect", "EU / US (SCCs)"],
  ["AI providers", "Generating assistant replies and summaries", "EU / US (SCCs)"],
];

export default function DPA() {
  return (
    <LegalLayout
      title="Data Processing Agreement"
      subtitle="For business customers who need a written DPA under Article 28 GDPR when using Pulse AI as a processor."
      description="Pulse AI Data Processing Agreement: roles, processing scope, sub-processors, security measures, international transfers, breach notification, deletion and audit rights."
      path="/dpa"
      sections={sections}
    >
      <Section id="parties" title="1. Parties and scope">
        <p>
          This agreement applies between the customer (controller) and Pulse AI (processor) for
          personal data that the customer uploads or connects to the platform. It supplements the
          Terms of Service and takes effect when the customer starts using the service.
        </p>
        <InfoCard title="Need a signed copy?">
          Use the "Download PDF" button above and email the signed document to info@mso.re. We
          counter-sign and return it within five business days.
        </InfoCard>
      </Section>

      <Section id="subject" title="2. Subject matter of processing">
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Duration:</strong> for the term of the subscription plus the deletion period.</li>
          <li><strong>Nature and purpose:</strong> hosting, storing and processing CRM, messaging and marketing data to deliver the service.</li>
          <li><strong>Categories of data subjects:</strong> the customer's staff, contacts, leads and end customers.</li>
          <li><strong>Categories of data:</strong> identity and contact details, conversation content, commercial records, technical identifiers.</li>
          <li><strong>Special categories:</strong> not intended; the customer must not upload such data without a valid legal basis and prior notice.</li>
        </ul>
      </Section>

      <Section id="obligations" title="3. Processor obligations">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Process personal data only on documented instructions from the controller.</li>
          <li>Ensure personnel with access are bound by confidentiality.</li>
          <li>Assist with data subject requests and with Articles 32–36 obligations.</li>
          <li>Make available the information needed to demonstrate compliance.</li>
        </ul>
      </Section>

      <Section id="subprocessors" title="4. Sub-processors">
        <p>The controller authorises the following sub-processors. Changes are announced at least 14 days in advance.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">Sub-processor</th>
                <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                <th className="text-left py-2 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map(([name, purpose, location]) => (
                <tr key={name} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{name}</td>
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2">{location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="security" title="5. Technical and organisational measures">
        <p>
          Measures include TLS 1.2+ in transit, encryption at rest, AES-256-GCM for stored
          credentials, Row Level Security per workspace, role-based access control, optional
          two-factor authentication, audit logging, rate limiting, signed webhooks and daily backups.
          Details are described in the Security Overview.
        </p>
      </Section>

      <Section id="transfers" title="6. International transfers">
        <p>
          Primary processing takes place in the European Union. Where a sub-processor processes data
          outside the EEA, transfers rely on the European Commission's Standard Contractual Clauses
          together with supplementary measures.
        </p>
      </Section>

      <Section id="breach" title="7. Breach notification">
        <p>
          Pulse AI notifies the controller without undue delay and within 72 hours of becoming aware
          of a personal data breach, including the nature of the incident, likely consequences and the
          measures taken.
        </p>
      </Section>

      <Section id="deletion" title="8. Return and deletion">
        <p>
          On termination the controller may export data for 30 days. After that, personal data is
          deleted from production systems within 30 days and from backups within 90 days, except where
          retention is required by law.
        </p>
      </Section>

      <Section id="audit" title="9. Audits">
        <p>
          The controller may request documentation of the measures above once per year, or after a
          reported incident. On-site audits are arranged with reasonable notice and must not disrupt
          operations or expose other customers' data.
        </p>
      </Section>
    </LegalLayout>
  );
}
