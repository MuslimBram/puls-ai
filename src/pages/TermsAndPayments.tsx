// src/pages/TermsAndPayments.tsx
// Payment Terms — public
//
// LEGAL CONTENT OPEN ITEM: Plan names and specific monthly prices that were
// previously hardcoded here did not match the canonical pricing source
// (public.pricing_settings uses keys: standard / professional / advanced / enterprise).
// Those hardcoded prices have been removed.  Current plan details are always
// drawn live from the pricing page and account dashboard.

import { Link } from "react-router-dom";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

const sections: LegalSection[] = [
  { id: "structure",    title: "1. Payment structure" },
  { id: "refunds",      title: "2. Refund policy" },
  { id: "preapproval",  title: "3. Pre-approval during onboarding" },
  { id: "transparency", title: "4. Cost transparency" },
];

const THIRD_PARTY_COSTS = [
  ["Meta Ads (Facebook/Instagram)", "Ad budget — paid directly to Meta. Pulse AI only syncs the statistics."],
  ["Google Ads",                     "Ad budget — paid directly to Google. Pulse AI only reads ROAS."],
  ["WhatsApp Business API",          "Template messages and phone number — paid to Meta/BSP."],
  ["Twilio (SMS + Calls)",           "Cost per SMS and call minutes — paid directly to Twilio."],
  ["Resend / SendGrid (Email)",      "Emails above the free tier — paid directly to Resend."],
  ["Google Workspace",               "Drive, Calendar, Gmail — paid to Google. Pulse AI only syncs."],
  ["Stripe processing fee",          "2.9% + 30 ALL per transaction — paid to Stripe, not Pulse AI."],
];

const TRANSPARENCY_ROWS = [
  // Pulse AI subscription — no hardcoded amounts; current prices are on the Pricing page
  ["Pulse AI subscription (any plan)",  "Pulse AI",        "✓ within 7 days — see Refund Policy"],
  ["Meta Ads budget",                   "Meta (Facebook)", "✗ — third party"],
  ["Google Ads budget",                 "Google",          "✗ — third party"],
  ["WhatsApp template messages",        "Meta / BSP",      "✗ — third party"],
  ["SMS (Twilio)",                      "Twilio",          "✗ — third party"],
  ["Email above included limit",        "Resend/SendGrid", "✗ — third party"],
  ["Stripe processing fee",             "Stripe",          "✗ — third party"],
];

const PREAPPROVAL_ITEMS = [
  "The two-tier cost structure (Pulse AI and third-party platforms are separate)",
  "The refund policy — the first payment is refunded within 7 days for valid reasons",
  "That payments to Meta, Google, Twilio, etc. are a direct relationship between the business and those companies",
  "That enabling certain features (WhatsApp API, Meta Ads sync, Google Workspace) requires additional payments to those platforms — Pulse AI only provides the integrations",
  "That their data will be stored in Supabase with AES-GCM encryption and will not be shared with third parties without consent",
];

export default function TermsAndPayments() {
  return (
    <LegalLayout
      title="Payment Terms"
      subtitle="The cost structure, refund rules, and pre-approval terms for Pulse AI subscriptions and third-party integrations."
      description="Pulse AI Payment Terms: subscription cost structure, third-party platform costs, refund policy, and cost transparency."
      path="/terms-and-payments"
      sections={sections}
    >
      <Section id="structure" title="1. Payment structure">
        <p>
          When registering with Pulse AI, the business agrees to pay two separate types of costs:
        </p>
        <div className="mt-4 space-y-4">
          <InfoCard title="A — Pulse AI Subscription (the platform)">
            Monthly or annual payment for access to the Pulse AI platform.
            Current plan details and prices are always drawn live from the{" "}
            <Link to="/pricing" className="text-primary underline">Pricing page</Link>.
            This payment covers: infrastructure, AI models, database, hosting, and support.
          </InfoCard>
          <InfoCard title="B — Third-party Platform Costs (not Pulse AI)">
            <p className="mb-3">
              These are payments made <strong>directly to third-party companies</strong> and are{" "}
              <strong>not part of Pulse AI</strong>:
            </p>
            <ul className="space-y-1.5">
              {THIRD_PARTY_COSTS.map(([name, desc]) => (
                <li key={name} className="flex gap-2 text-sm">
                  <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                  <span><strong>{name}:</strong> {desc}</span>
                </li>
              ))}
            </ul>
          </InfoCard>
        </div>
      </Section>

      <Section id="refunds" title="2. Refund policy">
        <div className="space-y-4">
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-5">
            <p className="font-medium text-green-800 dark:text-green-400 mb-2">✓ What is refundable</p>
            <ul className="text-sm text-green-700 dark:text-green-300 space-y-1.5">
              <li>• The first subscription payment within <strong>7 days</strong> if the platform did not work due to our fault</li>
              <li>• The unused period if Pulse AI has technical downtime &gt; 48 continuous hours</li>
              <li>• Verified billing errors (duplicate charge, incorrect amount)</li>
            </ul>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5">
            <p className="font-medium text-red-800 dark:text-red-400 mb-2">✗ What is NOT refundable</p>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
              <li>• <strong>Payments made to third-party platforms</strong> (Meta Ads, Google Ads, Twilio, Resend, Stripe fees) — these are outside our control</li>
              <li>• Monthly subscription after day 7, regardless of the reason</li>
              <li>• Costs incurred during active usage (AI calls, email sends, SMS)</li>
              <li>• Payments made with <strong>explicit approval</strong> during onboarding</li>
              <li>• Periods where the business had active access but chose not to use it</li>
            </ul>
          </div>
          <InfoCard title='"Moral or legal" cases'>
            If the business requests a refund for legal or ethical reasons, Pulse AI reviews each case
            individually. However, <strong>payments made to third-party platforms</strong> (Meta,
            Google, Twilio, etc.) are outside our jurisdiction and must be requested directly from
            those companies. The Pulse AI subscription payment is refunded only if it is verified that
            the platform caused direct, verifiable damage — not merely subjective dissatisfaction.
          </InfoCard>
        </div>
      </Section>

      <Section id="preapproval" title="3. Pre-approval during onboarding">
        <p>
          When the business clicks <strong>"Start Free Trial"</strong> or <strong>"Subscribe"</strong>,
          they agree to:
        </p>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          {PREAPPROVAL_ITEMS.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="transparency" title="4. Cost transparency">
        <p className="mb-4 text-sm text-muted-foreground">
          Current Pulse AI subscription prices are shown live on the{" "}
          <Link to="/pricing" className="text-primary underline">Pricing page</Link>. No plan prices
          are hard-coded in this document.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">Cost</th>
                <th className="text-left py-2 pr-4 font-medium">Paid to</th>
                <th className="text-left py-2 font-medium">Refundable?</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {TRANSPARENCY_ROWS.map(([cost, to, refund]) => (
                <tr key={cost} className="border-b border-border/50">
                  <td className="py-2 pr-4">{cost}</td>
                  <td className="py-2 pr-4">{to}</td>
                  <td className={`py-2 font-medium ${refund.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                    {refund}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          For questions about payments: <strong>info@mso.re</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}

