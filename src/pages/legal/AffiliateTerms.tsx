import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { formatALL } from "@/lib/currency";

const sections: LegalSection[] = [
  { id: "roles", title: "1. Ambassador vs Freelancer" },
  { id: "commission", title: "2. Commission rules" },
  { id: "calculator", title: "3. Commission calculator" },
  { id: "payouts", title: "4. Payouts" },
  { id: "conduct", title: "5. Conduct and prohibited practices" },
  { id: "termination", title: "6. Termination" },
];

const COMMISSION_RATE = 0.15;

export default function AffiliateTerms() {
  const [referrals, setReferrals] = useState(5);
  const [price, setPrice] = useState(119);

  const validReferrals = Number.isFinite(referrals) ? Math.max(0, referrals) : 0;
  const validPrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const earnings = validReferrals * validPrice * COMMISSION_RATE;
  const qualifies = validReferrals >= 3;

  return (
    <LegalLayout
      title="Ambassador & Freelancer Terms"
      subtitle="How partners earn with Pulse AI: commission rules, eligibility thresholds, payouts and prohibited practices."
      description="Pulse AI partner terms for Ambassadors and Freelancers: 15% commission on the net subscription value, minimum referral thresholds, payouts and conduct rules."
      path="/affiliate-terms"
      sections={sections}
    >
      <Section id="roles" title="1. Ambassador vs Freelancer">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">Criterion</th>
                <th className="text-left py-2 pr-4 font-medium">Ambassador</th>
                <th className="text-left py-2 font-medium">Freelancer</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Main benefit", "Cash commission on referrals", "Discounted access to manage client workspaces"],
                ["Commission", "15% lifetime + 15% bonus on the first payment", "15% of the net subscription value"],
                ["Management fee", "Not applicable", "20% of the management fee charged to the client"],
                ["Minimum activity", "At least 3 referrals per month", "At least 3 active referred businesses"],
                ["Self-referral", "Not allowed", "Not allowed"],
                ["Client ownership", "Client owns their workspace", "Client owns their workspace; freelancer manages with permission"],
              ].map(([c, a, f]) => (
                <tr key={c} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{c}</td>
                  <td className="py-2 pr-4">{a}</td>
                  <td className="py-2">{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="commission" title="2. Commission rules">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Commission is earned on the <strong>first successful payment</strong> of a referred client only.</li>
          <li>The referral must be attributed through your unique referral link at registration.</li>
          <li>Only referrals with status <em>active</em> (paid and not refunded) count.</li>
          <li>Ambassadors must generate at least 3 qualifying referrals per calendar month to remain active.</li>
          <li>Subscriptions purchased by the partner for themselves do not earn commission.</li>
          <li>If a referred payment is refunded or charged back, the related commission is reversed.</li>
        </ul>
      </Section>

      <Section id="calculator" title="3. Commission calculator">
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="referrals">Referred clients per month</Label>
              <Input
                id="referrals"
                type="number"
                min={0}
                value={referrals}
                onChange={(e) => setReferrals(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Plan price (EUR / month)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Estimated commission (15% of net subscription value)
            </div>
            <div className="text-2xl font-semibold text-foreground">
              {formatALL(earnings)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {qualifies
                ? "Meets the minimum of 3 referrals per month."
                : "Below the minimum of 3 referrals per month; commission is not paid out for that month."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Illustrative estimate only. Actual amounts depend on confirmed payments recorded in your
            partner dashboard.
          </p>
        </div>
      </Section>

      <Section id="payouts" title="4. Payouts">
        <InfoCard title="Payout terms">
          <ul className="list-disc pl-5 space-y-1">
            <li>Commissions are confirmed after the refund window of the referred payment closes.</li>
            <li>Payouts are requested from the partner wallet to PayPal or Payoneer.</li>
            <li>Partners are responsible for declaring and paying their own taxes.</li>
          </ul>
        </InfoCard>
      </Section>

      <Section id="conduct" title="5. Conduct and prohibited practices">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>No spam, unsolicited bulk messaging or misleading advertising.</li>
          <li>No bidding on Pulse AI brand terms in paid search without written approval.</li>
          <li>No fake accounts, self-referrals or incentivised sign-ups that do not intend to use the product.</li>
          <li>No promises of guaranteed revenue results on behalf of Pulse AI.</li>
        </ul>
      </Section>

      <Section id="termination" title="6. Termination">
        <p>
          Either side may end the partnership at any time. Confirmed commissions remain payable.
          Commissions linked to fraudulent or policy-breaking referrals are forfeited, and Pulse AI may
          close the partner account.
        </p>
      </Section>
    </LegalLayout>
  );
}
