// src/pages/TermsAndPayments.tsx
// Payment policy + Terms of Service — public

export default function TermsAndPayments() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-semibold mb-2">Terms of Service and Payment Policy</h1>
        <p className="text-muted-foreground mb-10">Pulse AI — Version 1.0 · Effective: January 2026</p>

        {/* SECTION 1 */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">1. Payment Structure</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            When registering with Pulse AI, the business agrees to pay two separate types of costs:
          </p>
          <div className="space-y-4">
            <div className="border border-border rounded-xl p-5">
              <div className="font-medium mb-2">A — Pulse AI Subscription (the platform)</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Monthly/annual payment for access to the Pulse AI platform (Starter 9,900 ALL/mo, Growth 19,900 ALL/mo, Pro 39,900 ALL/mo).
                This payment covers: infrastructure, AI (Gemini + Claude), Supabase, hosting, and support.
              </p>
            </div>
            <div className="border border-border rounded-xl p-5">
              <div className="font-medium mb-2">B — Third-party Platform Costs (not Pulse AI)</div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                These are payments made <strong>directly to third-party companies</strong> and are <strong>not part of Pulse AI</strong>:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
                {[
                  ["Meta Ads (Facebook/Instagram)", "Ad budget — paid directly to Meta. Pulse AI only syncs the statistics."],
                  ["Google Ads", "Ad budget — paid directly to Google. Pulse AI only reads ROAS."],
                  ["WhatsApp Business API", "Template messages and phone number — paid to Meta/BSP."],
                  ["Twilio (SMS + Calls)", "Cost per SMS and call minutes — paid directly to Twilio."],
                  ["Resend / SendGrid (Email)", "Emails above the free tier — paid directly to Resend."],
                  ["Google Workspace", "Drive, Calendar, Gmail — paid to Google. Pulse AI only syncs."],
                  ["Stripe processing fee", "2.9% + 30 ALL per transaction — paid to Stripe, not Pulse AI."],
                ].map(([name, desc]) => (
                  <li key={name} className="flex gap-2">
                    <span className="text-amber-500 mt-0.5">⚠</span>
                    <span><strong>{name}:</strong> {desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* SECTION 2 — REFUNDS */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">2. Refund Policy</h2>

          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-5 mb-4">
            <div className="font-medium text-green-800 dark:text-green-400 mb-2">✓ What is refundable</div>
            <ul className="text-sm text-green-700 dark:text-green-300 space-y-1.5">
              <li>• The first subscription payment within <strong>7 days</strong> if the platform did not work due to our fault</li>
              <li>• The unused period if Pulse AI has technical downtime {'>'} 48 continuous hours</li>
              <li>• Verified billing errors (duplicate charge, incorrect amount)</li>
            </ul>
          </div>

          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-5 mb-4">
            <div className="font-medium text-red-800 dark:text-red-400 mb-2">✗ What is NOT refundable</div>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
              <li>• <strong>Payments made to third-party platforms</strong> (Meta Ads, Google Ads, Twilio, Resend, Stripe fees) — these are outside our control</li>
              <li>• Monthly subscription after day 7, regardless of the reason</li>
              <li>• Costs incurred during active usage (AI calls, email sends, SMS)</li>
              <li>• Payments made with <strong>explicit approval</strong> during onboarding</li>
              <li>• Periods where the business had active access but chose not to use it</li>
            </ul>
          </div>

          <div className="border border-border rounded-xl p-5">
            <div className="font-medium mb-2">"Moral or legal" cases</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If the business requests a refund for legal or ethical reasons, Pulse AI reviews each case individually.
              However, <strong>payments made to third-party platforms</strong> (Meta, Google, Twilio, etc.) are outside
              our jurisdiction and must be requested directly from those companies.
              The Pulse AI subscription payment is refunded only if it is verified that the platform caused direct,
              verifiable damage — not merely subjective dissatisfaction.
            </p>
          </div>
        </section>

        {/* SECTION 3 — PRE-APPROVAL */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">3. Pre-approval during Onboarding</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            When the business clicks <strong>"Start Free Trial"</strong> or <strong>"Subscribe"</strong>, they agree to:
          </p>
          <ol className="space-y-3 text-sm text-muted-foreground">
            {[
              "The two-tier cost structure (Pulse AI and third-party platforms are separate)",
              "The refund policy — the first payment is refunded within 7 days for valid reasons",
              "That payments to Meta, Google, Twilio, etc. are a direct relationship between the business and those companies",
              "That enabling certain features (WhatsApp API, Meta Ads sync, Google Workspace) requires additional payments to those platforms — Pulse AI only provides the integrations",
              "That their data will be stored in Supabase with AES-GCM encryption and will not be shared with third parties without consent",
            ].map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-semibold text-primary shrink-0">{i+1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* SECTION 4 — TRANSPARENCY */}
        <section className="mb-10">
          <h2 className="text-xl font-medium mb-4">4. Full Cost Transparency</h2>
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
                {[
                  ["Starter subscription 9,900 ALL/mo", "Pulse AI", "✓ within 7 days"],
                  ["Growth subscription 19,900 ALL/mo", "Pulse AI", "✓ within 7 days"],
                  ["Pro subscription 39,900 ALL/mo", "Pulse AI", "✓ within 7 days"],
                  ["Meta Ads budget", "Meta (Facebook)", "✗ — third party"],
                  ["Google Ads budget", "Google", "✗ — third party"],
                  ["WhatsApp template msgs", "Meta / BSP", "✗ — third party"],
                  ["SMS (Twilio)", "Twilio", "✗ — third party"],
                  ["Email above limit", "Resend/SendGrid", "✗ — third party"],
                  ["Stripe processing fee", "Stripe", "✗ — third party"],
                ].map(([cost, to, refund]) => (
                  <tr key={cost} className="border-b border-border/50">
                    <td className="py-2 pr-4">{cost}</td>
                    <td className="py-2 pr-4">{to}</td>
                    <td className={`py-2 font-medium ${refund.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{refund}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="border border-border rounded-xl p-5 text-sm text-muted-foreground">
          <p>For questions about payments: <strong>info@mso.re</strong></p>
          <p className="mt-1">Pulse AI · kohablerjeve.top</p>
        </div>
      </div>
    </div>
  );
}
