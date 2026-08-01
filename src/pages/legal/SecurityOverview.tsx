import { Lock, Shield, Server, KeyRound, Eye, AlertTriangle } from "lucide-react";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "pillars", title: "1. Six security pillars" },
  { id: "encryption", title: "2. Encryption" },
  { id: "access", title: "3. Access control" },
  { id: "hosting", title: "4. Hosting and location" },
  { id: "monitoring", title: "5. Monitoring and backups" },
  { id: "responsibility", title: "6. Shared responsibility" },
  { id: "report", title: "7. Reporting a vulnerability" },
];

const pillars = [
  { icon: Lock, title: "Encryption", body: "TLS 1.2+ in transit, encryption at rest, and AES-256-GCM for stored integration credentials." },
  { icon: Shield, title: "Row Level Security", body: "Every workspace table is protected by database-level policies so data cannot cross workspaces." },
  { icon: KeyRound, title: "Authentication", body: "Mandatory email verification, optional TOTP two-factor, 24-hour session expiry and new-device approval." },
  { icon: Server, title: "EU hosting", body: "Production databases, storage and functions run in the European Union (Frankfurt region)." },
  { icon: Eye, title: "Audit logging", body: "Administrative actions, credential changes and webhook activity are recorded for review." },
  { icon: AlertTriangle, title: "Webhook integrity", body: "Inbound webhooks are verified with HMAC-SHA256 signatures and per-tenant credentials." },
];

export default function SecurityOverview() {
  return (
    <LegalLayout
      title="Security Overview"
      subtitle="The controls Pulse AI uses to protect your workspace, your customers' data and your connected channels."
      description="Pulse AI security overview: AES-256-GCM credential encryption, Row Level Security, EU hosting, two-factor authentication, audit logging and vulnerability reporting."
      path="/security"
      sections={sections}
    >
      <Section id="pillars" title="1. Six security pillars">
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border p-5">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-medium text-foreground mb-1">{title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="encryption" title="2. Encryption">
        <p>
          Traffic between your browser and Pulse AI uses TLS 1.2 or higher. Data at rest is encrypted
          by the managed database layer. API keys, OAuth tokens and channel credentials are encrypted
          with AES-256-GCM before storage and are never returned to the browser in plain text.
        </p>
      </Section>

      <Section id="access" title="3. Access control">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Role-based access: owner, admin, manager, agent and partner roles with distinct permissions.</li>
          <li>Roles are stored in a dedicated table and validated server-side, never in the browser.</li>
          <li>Two-factor authentication (TOTP) is available for all accounts.</li>
          <li>Logins from unrecognised devices require administrator approval.</li>
          <li>Sessions expire automatically after 24 hours of inactivity.</li>
        </ul>
      </Section>

      <Section id="hosting" title="4. Hosting and location">
        <p>
          Application data is hosted on managed EU infrastructure in Frankfurt, Germany. Serverless
          functions execute in the same region. Sub-processors are listed in the Privacy Policy and
          the Data Processing Agreement.
        </p>
      </Section>

      <Section id="monitoring" title="5. Monitoring and backups">
        <p>
          Automated database backups run daily with point-in-time recovery. Error rates, function
          failures and abnormal webhook traffic are monitored continuously, and rate limiting protects
          public endpoints from abuse.
        </p>
      </Section>

      <Section id="responsibility" title="6. Shared responsibility">
        <InfoCard title="What we do">
          Platform hardening, encryption, database isolation, patching, monitoring and incident
          response for the Pulse AI infrastructure.
        </InfoCard>
        <InfoCard title="What you do">
          Use strong unique passwords, enable two-factor authentication, review who has access to your
          workspace, and revoke integrations you no longer use.
        </InfoCard>
        <p>
          This page describes controls that are in place today. It is not a certification, and it does
          not claim absolute security; no online platform can offer that.
        </p>
      </Section>

      <Section id="report" title="7. Reporting a vulnerability">
        <p>
          Email info@mso.re with the subject "Security" and include reproduction steps. We acknowledge
          reports within two business days and will keep you updated until the issue is resolved.
          Please do not publicly disclose an issue before we have had a chance to fix it.
        </p>
      </Section>
    </LegalLayout>
  );
}
