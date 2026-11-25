// src/pages/TermsAndPayments.tsx
// Payment Terms — public
//
// Plan names and prices are intentionally not hard-coded here. Current plan
// details are drawn from the Pricing page and account dashboard.

import { Link } from "react-router-dom";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function TermsAndPayments() {
  const { locale, localizedPath } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "structure", title: "1. Struktura e pagesave" },
        { id: "refunds", title: "2. Politika e rimbursimit" },
        { id: "preapproval", title: "3. Miratimi paraprak gjatë onboarding" },
        { id: "transparency", title: "4. Transparenca e kostove" },
      ]
    : [
        { id: "structure", title: "1. Payment structure" },
        { id: "refunds", title: "2. Refund policy" },
        { id: "preapproval", title: "3. Pre-approval during onboarding" },
        { id: "transparency", title: "4. Cost transparency" },
      ];

  const thirdPartyCosts = isSq
    ? [
        ["Meta Ads (Facebook/Instagram)", "Buxheti i reklamave dhe tarifat përkatëse paguhen sipas kushteve të Meta."],
        ["Google Ads", "Buxheti i reklamave dhe tarifat përkatëse paguhen sipas kushteve të Google."],
        ["WhatsApp Business", "Tarifat e mesazheve ose shërbimeve të kanalit varen nga ofruesi përkatës."],
        ["Twilio", "SMS, telefonia dhe shërbime të tjera të përdorimit tarifohen sipas planit të Twilio."],
        ["Email providers", "Përdorimi mbi kufijtë e përfshirë mund të krijojë tarifa të ofruesit të email-it."],
        ["Google Workspace", "Shërbimet Google Workspace faturohen sipas marrëdhënies së biznesit me Google."],
        ["Payment processing", "Tarifat e përpunimit të pagesave përcaktohen nga ofruesi i pagesës."],
      ]
    : [
        ["Meta Ads (Facebook/Instagram)", "Ad budgets and related charges are paid under Meta's applicable terms."],
        ["Google Ads", "Ad budgets and related charges are paid under Google's applicable terms."],
        ["WhatsApp Business", "Messaging or channel-service charges depend on the applicable provider."],
        ["Twilio", "SMS, telephony, and other usage services are charged under the applicable Twilio plan."],
        ["Email providers", "Usage above included limits may create charges from the applicable email provider."],
        ["Google Workspace", "Google Workspace services are billed under the business's relationship with Google."],
        ["Payment processing", "Payment-processing fees are determined by the applicable payment provider."],
      ];

  const transparencyRows = isSq
    ? [
        ["Abonimi Pulse AI — pagesa e parë", "Pulse AI", "Kërkesë brenda 7 ditëve, subjekt shqyrtimi"],
        ["Rinovimet e abonimit Pulse AI", "Pulse AI", "Jashtë rrjedhës standarde të rimbursimit"],
        ["Buxhetet e reklamave", "Ofruesi i reklamave", "Jo nga Pulse AI"],
        ["Mesazhe / SMS / telefonia", "Ofruesi i kanalit", "Jo nga Pulse AI"],
        ["Tarifat e përpunimit të pagesave", "Ofruesi i pagesës", "Sipas kushteve të ofruesit"],
      ]
    : [
        ["Pulse AI subscription — first payment", "Pulse AI", "Request within 7 days, subject to review"],
        ["Pulse AI subscription renewals", "Pulse AI", "Outside the standard refund flow"],
        ["Advertising budgets", "Advertising provider", "Not refundable by Pulse AI"],
        ["Messaging / SMS / telephony", "Channel provider", "Not refundable by Pulse AI"],
        ["Payment-processing fees", "Payment provider", "Under the provider's terms"],
      ];

  const preapprovalItems = isSq
    ? [
        "Strukturën e kostove: abonimi Pulse AI dhe kostot e palëve të treta janë kategori të ndara.",
        "Rrjedhën standarde të rimbursimit: vetëm pagesa e parë mund të paraqitet për shqyrtim brenda 7 ditëve dhe kërkesa i nënshtrohet rregullave aktive të përdorimit.",
        "Pagesat ndaj Meta, Google, Twilio dhe ofruesve të tjerë rregullohen nga marrëdhënia e biznesit me ata ofrues.",
        "Aktivizimi i disa integrimeve mund të kërkojë llogari ose pagesa të veçanta te ofruesit përkatës.",
        "Përpunimi i të dhënave rregullohet nga Politika e Privatësisë dhe DPA e Pulse AI.",
      ]
    : [
        "The cost structure: the Pulse AI subscription and third-party costs are separate categories.",
        "The standard refund flow: only the first payment may be submitted for review within 7 days, and the request is subject to the active usage rules.",
        "Payments to Meta, Google, Twilio, and other providers are governed by the business's relationship with those providers.",
        "Enabling some integrations may require separate provider accounts or charges.",
        "Data processing is governed by the Pulse AI Privacy Policy and DPA.",
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet e Pagesave" : "Payment Terms"}
      subtitle={isSq
        ? "Struktura e kostove, rrjedha standarde e rimbursimit dhe transparenca për abonimet Pulse AI dhe integrimet me palë të treta."
        : "The cost structure, standard refund flow, and transparency rules for Pulse AI subscriptions and third-party integrations."}
      description={isSq
        ? "Kushtet e Pagesave të Pulse AI: abonimi, kostot e palëve të treta, kërkesat e rimbursimit brenda 7 ditëve dhe transparenca e kostove."
        : "Pulse AI Payment Terms: subscriptions, third-party costs, refund requests within 7 days, and cost transparency."}
      path="/terms-and-payments"
      sections={sections}
    >
      <Section id="structure" title={sections[0].title}>
        <p>{isSq
          ? "Kur përdor shërbime të Pulse AI, biznesi mund të ketë dy kategori të ndara kostosh:"
          : "When using Pulse AI services, a business may have two separate categories of costs:"}</p>
        <div className="mt-4 space-y-4">
          <InfoCard title={isSq ? "A — Abonimi Pulse AI" : "A — Pulse AI subscription"}>
            {isSq
              ? "Pagesa për akses në platformën Pulse AI. Detajet dhe çmimet aktuale të planeve shfaqen në "
              : "Payment for access to the Pulse AI platform. Current plan details and prices are shown on the "}
            <Link to={localizedPath("/pricing")} className="text-primary underline">
              {isSq ? "faqen e Çmimeve" : "Pricing page"}
            </Link>
            {isSq ? "." : "."}
          </InfoCard>

          <InfoCard title={isSq ? "B — Kostot e palëve të treta" : "B — Third-party costs"}>
            <p className="mb-3">{isSq
              ? "Disa integrime lidhen me shërbime të jashtme. Kostot e këtyre shërbimeve nuk janë automatikisht pjesë e abonimit Pulse AI dhe varen nga ofruesi përkatës."
              : "Some integrations connect to external services. Charges for those services are not automatically part of the Pulse AI subscription and depend on the applicable provider."}</p>
            <ul className="space-y-1.5">
              {thirdPartyCosts.map(([name, desc]) => (
                <li key={name} className="flex gap-2 text-sm">
                  <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                  <span><strong>{name}:</strong> {desc}</span>
                </li>
              ))}
            </ul>
          </InfoCard>
        </div>
      </Section>

      <Section id="refunds" title={sections[1].title}>
        <div className="space-y-4">
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-5">
            <p className="font-medium text-green-800 dark:text-green-400 mb-2">
              {isSq ? "✓ Kur mund të paraqitet kërkesa standarde" : "✓ When a standard request may be submitted"}
            </p>
            <ul className="text-sm text-green-700 dark:text-green-300 space-y-1.5">
              <li>• {isSq ? <>Duhet të jetë <strong>pagesa e parë</strong> e suksesshme e abonimit.</> : <>It must be the <strong>first</strong> successful subscription payment.</>}</li>
              <li>• {isSq ? <>Kërkesa duhet të paraqitet brenda <strong>7 ditëve</strong> nga fillimi i ciklit përkatës të faturimit.</> : <>The request must be submitted within <strong>7 days</strong> of the relevant billing-cycle start.</>}</li>
              <li>• {isSq ? "Kërkesa shqyrtohet sipas pragjeve aktive të përdorimit dhe nuk miratohet automatikisht." : "The request is reviewed against the active usage thresholds and is not automatically approved."}</li>
            </ul>
          </div>

          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5">
            <p className="font-medium text-red-800 dark:text-red-400 mb-2">
              {isSq ? "✗ Jashtë rrjedhës standarde" : "✗ Outside the standard flow"}
            </p>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
              <li>• {isSq ? "Rinovimet dhe pagesat pas pagesës së parë." : "Renewals and payments after the first payment."}</li>
              <li>• {isSq ? "Kërkesat e paraqitura pas afatit 7-ditor." : "Requests submitted after the 7-day window."}</li>
              <li>• {isSq ? "Kërkesat që tejkalojnë pragjet aktive të përdorimit mund të bllokohen." : "Requests that exceed the active usage thresholds may be blocked."}</li>
              <li>• {isSq ? "Pagesat e bëra drejtpërdrejt te ofrues të palëve të treta nuk rimbursohen nga Pulse AI." : "Payments made directly to third-party providers are not refundable by Pulse AI."}</li>
            </ul>
          </div>

          <InfoCard title={isSq ? "Shqyrtimi" : "Review process"}>
            {isSq
              ? "Paraqitja e një kërkese krijon një kërkesë për shqyrtim. Miratimi dhe përpunimi i rimbursimit janë hapa të veçantë dhe varen nga statusi i kërkesës dhe pagesës burimore."
              : "Submitting a request creates a refund request for review. Approval and refund processing are separate steps and depend on the request status and source payment."}
          </InfoCard>
        </div>
      </Section>

      <Section id="preapproval" title={sections[2].title}>
        <p>{isSq
          ? "Përpara aktivizimit të një abonimi ose integrimi me pagesë, biznesi duhet të kuptojë:"
          : "Before activating a paid subscription or integration, the business should understand:"}</p>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          {preapprovalItems.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="transparency" title={sections[3].title}>
        <p className="mb-4 text-sm text-muted-foreground">
          {isSq ? "Çmimet aktuale të abonimeve Pulse AI shfaqen në " : "Current Pulse AI subscription prices are shown on the "}
          <Link to={localizedPath("/pricing")} className="text-primary underline">
            {isSq ? "faqen e Çmimeve" : "Pricing page"}
          </Link>
          {isSq ? ". Në këtë dokument nuk hardcode-ohen çmimet e planeve." : ". Plan prices are not hard-coded in this document."}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Kostoja" : "Cost"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Paguhet te" : "Paid to"}</th>
                <th className="text-left py-2 font-medium">{isSq ? "Statusi i rimbursimit" : "Refund status"}</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {transparencyRows.map(([cost, to, refund]) => (
                <tr key={cost} className="border-b border-border/50">
                  <td className="py-2 pr-4">{cost}</td>
                  <td className="py-2 pr-4">{to}</td>
                  <td className="py-2">{refund}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          {isSq ? "Për pyetje rreth pagesave:" : "For payment questions:"} <strong>muslim.brami@gmail.com</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}
