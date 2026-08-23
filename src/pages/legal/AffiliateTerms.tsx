import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { formatALL } from "@/lib/currency";
import { usePublicLocale } from "@/hooks/usePublicLocale";

const COMMISSION_RATE = 0.15;

export default function AffiliateTerms() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";
  const [referrals, setReferrals] = useState(5);
  const [price, setPrice] = useState(119);

  const validReferrals = Number.isFinite(referrals) ? Math.max(0, referrals) : 0;
  const validPrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const earnings = validReferrals * validPrice * COMMISSION_RATE;
  const qualifies = validReferrals >= 3;

  const sections: LegalSection[] = isSq
    ? [
        { id: "roles", title: "1. Ambasador vs Freelancer" },
        { id: "commission", title: "2. Rregullat e komisionit" },
        { id: "calculator", title: "3. Llogaritësi i komisionit" },
        { id: "payouts", title: "4. Pagesat" },
        { id: "conduct", title: "5. Sjellja dhe praktikat e ndaluara" },
        { id: "termination", title: "6. Përfundimi" },
      ]
    : [
        { id: "roles", title: "1. Ambassador vs Freelancer" },
        { id: "commission", title: "2. Commission rules" },
        { id: "calculator", title: "3. Commission calculator" },
        { id: "payouts", title: "4. Payouts" },
        { id: "conduct", title: "5. Conduct and prohibited practices" },
        { id: "termination", title: "6. Termination" },
      ];

  const roleRows = isSq
    ? [
        ["Përfitimi kryesor", "Komision në para për referimet", "Akses me zbritje për të menaxhuar workspace-et e klientëve"],
        ["Komisioni", "15% për gjithë kohëzgjatjen + 15% bonus në pagesën e parë", "15% e vlerës neto të abonimit"],
        ["Tarifa e menaxhimit", "Nuk aplikohet", "20% e tarifës së menaxhimit që i ngarkohet klientit"],
        ["Aktiviteti minimal", "Të paktën 3 referime në muaj", "Të paktën 3 biznese aktive të referuara"],
        ["Vetë-referimi", "Nuk lejohet", "Nuk lejohet"],
        ["Pronësia e klientit", "Klienti zotëron workspace-in e tij", "Klienti zotëron workspace-in e tij; freelanceri e menaxhon me leje"],
      ]
    : [
        ["Main benefit", "Cash commission on referrals", "Discounted access to manage client workspaces"],
        ["Commission", "15% lifetime + 15% bonus on the first payment", "15% of the net subscription value"],
        ["Management fee", "Not applicable", "20% of the management fee charged to the client"],
        ["Minimum activity", "At least 3 referrals per month", "At least 3 active referred businesses"],
        ["Self-referral", "Not allowed", "Not allowed"],
        ["Client ownership", "Client owns their workspace", "Client owns their workspace; freelancer manages with permission"],
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet për Ambasadorë & Freelancerë" : "Ambassador & Freelancer Terms"}
      subtitle={isSq
        ? "Si fitojnë partnerët me Pulse AI: rregullat e komisionit, pragjet e pranueshmërisë, pagesat dhe praktikat e ndaluara."
        : "How partners earn with Pulse AI: commission rules, eligibility thresholds, payouts and prohibited practices."}
      description={isSq
        ? "Kushtet e partnerëve të Pulse AI për Ambasadorë dhe Freelancerë: komision 15% mbi vlerën neto të abonimit, pragjet minimale të referimeve, pagesat dhe rregullat e sjelljes."
        : "Pulse AI partner terms for Ambassadors and Freelancers: 15% commission on the net subscription value, minimum referral thresholds, payouts and conduct rules."}
      path="/affiliate-terms"
      sections={sections}
    >
      <Section id="roles" title={sections[0].title}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Kriteri" : "Criterion"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Ambasador" : "Ambassador"}</th>
                <th className="text-left py-2 font-medium">Freelancer</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map(([criterion, ambassador, freelancer]) => (
                <tr key={criterion} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{criterion}</td>
                  <td className="py-2 pr-4">{ambassador}</td>
                  <td className="py-2">{freelancer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="commission" title={sections[1].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Komisioni fitohet vetëm mbi pagesën e parë të suksesshme të një klienti të referuar.",
                "Referimi duhet të atribuohet përmes linkut tuaj unik të referimit gjatë regjistrimit.",
                "Vetëm referimet me status aktiv (të paguara dhe të parimbursuara) llogariten.",
                "Ambasadorët duhet të gjenerojnë të paktën 3 referime kualifikuese për muaj kalendarik për të mbetur aktivë.",
                "Abonimet e blera nga partneri për veten nuk gjenerojnë komision.",
                "Nëse një pagesë e referuar rimbursohet ose kthehet mbrapsht, komisioni përkatës anulohet.",
              ]
            : [
                "Commission is earned on the first successful payment of a referred client only.",
                "The referral must be attributed through your unique referral link at registration.",
                "Only referrals with status active (paid and not refunded) count.",
                "Ambassadors must generate at least 3 qualifying referrals per calendar month to remain active.",
                "Subscriptions purchased by the partner for themselves do not earn commission.",
                "If a referred payment is refunded or charged back, the related commission is reversed.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="calculator" title={sections[2].title}>
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="referrals">{isSq ? "Klientë të referuar në muaj" : "Referred clients per month"}</Label>
              <Input
                id="referrals"
                type="number"
                min={0}
                value={referrals}
                onChange={(e) => setReferrals(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">{isSq ? "Çmimi i planit (EUR / muaj)" : "Plan price (EUR / month)"}</Label>
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
              {isSq ? "Komision i vlerësuar (15% e vlerës neto të abonimit)" : "Estimated commission (15% of net subscription value)"}
            </div>
            <div className="text-2xl font-semibold text-foreground">{formatALL(earnings)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {qualifies
                ? (isSq ? "Plotëson minimumin prej 3 referimesh në muaj." : "Meets the minimum of 3 referrals per month.")
                : (isSq ? "Nën minimumin prej 3 referimesh në muaj; komisioni nuk paguhet për atë muaj." : "Below the minimum of 3 referrals per month; commission is not paid out for that month.")}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isSq
              ? "Vetëm vlerësim ilustrues. Shumat reale varen nga pagesat e konfirmuara të regjistruara në dashboard-in tuaj të partnerit."
              : "Illustrative estimate only. Actual amounts depend on confirmed payments recorded in your partner dashboard."}
          </p>
        </div>
      </Section>

      <Section id="payouts" title={sections[3].title}>
        <InfoCard title={isSq ? "Kushtet e pagesës" : "Payout terms"}>
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Komisionet konfirmohen pasi mbyllet afati i rimbursimit për pagesën e referuar.",
                  "Pagesat kërkohen nga portofoli i partnerit drejt PayPal ose Payoneer.",
                  "Partnerët janë përgjegjës për deklarimin dhe pagesën e tatimeve të tyre.",
                ]
              : [
                  "Commissions are confirmed after the refund window of the referred payment closes.",
                  "Payouts are requested from the partner wallet to PayPal or Payoneer.",
                  "Partners are responsible for declaring and paying their own taxes.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
      </Section>

      <Section id="conduct" title={sections[4].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Nuk lejohet spam-i, mesazhet masive të pakërkuara ose reklamat mashtruese.",
                "Nuk lejohet ofertimi mbi termat e markës Pulse AI në kërkimet me pagesë pa miratim me shkrim.",
                "Nuk lejohen llogari të rreme, vetë-referime ose regjistrime të stimuluara që nuk synojnë ta përdorin produktin.",
                "Nuk lejohen premtime për rezultate të garantuara të të ardhurave në emër të Pulse AI.",
              ]
            : [
                "No spam, unsolicited bulk messaging or misleading advertising.",
                "No bidding on Pulse AI brand terms in paid search without written approval.",
                "No fake accounts, self-referrals or incentivised sign-ups that do not intend to use the product.",
                "No promises of guaranteed revenue results on behalf of Pulse AI.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="termination" title={sections[5].title}>
        <p>{isSq
          ? "Secila palë mund ta përfundojë partneritetin në çdo kohë. Komisionet e konfirmuara mbeten të pagueshme. Komisionet e lidhura me referime mashtruese ose që shkelin politikat humbasin, dhe Pulse AI mund të mbyllë llogarinë e partnerit."
          : "Either side may end the partnership at any time. Confirmed commissions remain payable. Commissions linked to fraudulent or policy-breaking referrals are forfeited, and Pulse AI may close the partner account."}</p>
      </Section>
    </LegalLayout>
  );
}
