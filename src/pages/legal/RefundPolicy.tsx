import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function RefundPolicy() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "timeline", title: "1. Afati i rimbursimit" },
        { id: "eligible", title: "2. Kur mund të kërkohet rimbursim" },
        { id: "not-eligible", title: "3. Kur nuk kualifikohet kërkesa" },
        { id: "third-party", title: "4. Tarifat e palëve të treta" },
        { id: "cancellation", title: "5. Anulimi i abonimit" },
        { id: "how", title: "6. Si të kërkoni rimbursim" },
      ]
    : [
        { id: "timeline", title: "1. Refund timeline" },
        { id: "eligible", title: "2. When a refund may be requested" },
        { id: "not-eligible", title: "3. When a request is not eligible" },
        { id: "third-party", title: "4. Third-party charges" },
        { id: "cancellation", title: "5. Cancelling a subscription" },
        { id: "how", title: "6. How to request a refund" },
      ];

  const timeline = isSq
    ? [
        [
          "Ditët 0–7",
          "Vetëm pagesa e parë e abonimit",
          "Mund të paraqitet një kërkesë për rimbursim. Kërkesa shqyrtohet sipas përdorimit të llogarisë dhe rregullave aktive të rimbursimit; paraqitja e kërkesës nuk përbën miratim automatik.",
        ],
        [
          "Pas ditës së 7-të ose në rinovime",
          "Pagesa jashtë rrjedhës standarde të rimbursimit",
          "Rrjedha standarde e Pulse AI nuk pranon kërkesa për rimbursim të rinovimeve ose kërkesa të paraqitura pas afatit 7-ditor.",
        ],
      ]
    : [
        [
          "Days 0–7",
          "First subscription payment only",
          "A refund request may be submitted. The request is reviewed against account usage and the active refund rules; submitting a request does not mean it is automatically approved.",
        ],
        [
          "After day 7 or on renewals",
          "Outside the standard refund flow",
          "Pulse AI's standard refund flow does not accept renewal refunds or requests submitted after the 7-day window.",
        ],
      ];

  return (
    <LegalLayout
      title={isSq ? "Rimbursimi & Anulimi" : "Refund & Cancellation"}
      subtitle={isSq
        ? "Rregullat e rrjedhës standarde të rimbursimit të Pulse AI, tarifat e palëve të treta dhe anulimi i abonimit."
        : "The rules for Pulse AI's standard refund flow, third-party charges, and subscription cancellation."}
      description={isSq
        ? "Politika e rimbursimit dhe anulimit e Pulse AI: kërkesat për pagesën e parë brenda 7 ditëve, shqyrtimi sipas përdorimit, tarifat e palëve të treta dhe anulimi."
        : "Pulse AI refund and cancellation policy: first-payment requests within 7 days, usage-based review, third-party charges, and cancellation."}
      path="/refund"
      sections={sections}
    >
      <Section id="timeline" title={sections[0].title}>
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

      <Section id="eligible" title={sections[1].title}>
        <InfoCard title={isSq ? "Kërkesa standarde" : "Standard request"} tone="positive">
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Kërkesa duhet të lidhet me pagesën e parë të suksesshme të abonimit.",
                  "Kërkesa duhet të paraqitet brenda 7 ditëve nga fillimi i ciklit përkatës të faturimit.",
                  "Kërkesa i nënshtrohet shqyrtimit dhe pragjeve aktive të përdorimit; përdorimi i konsiderueshëm i produktit mund ta bëjë kërkesën të papranueshme.",
                  "Rimbursimi përpunohet vetëm pasi kërkesa të jetë shqyrtuar dhe miratuar.",
                ]
              : [
                  "The request must relate to the first successful subscription payment.",
                  "The request must be submitted within 7 days of the relevant billing-cycle start.",
                  "The request is subject to review and the active usage thresholds; significant product usage may make the request ineligible.",
                  "A refund is processed only after the request has been reviewed and approved.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
      </Section>

      <Section id="not-eligible" title={sections[2].title}>
        <InfoCard title={isSq ? "Jashtë rrjedhës standarde" : "Outside the standard flow"} tone="warning">
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Rinovimet dhe pagesat pas pagesës së parë nuk kualifikohen për rrjedhën standarde të rimbursimit.",
                  "Kërkesat e paraqitura pas afatit 7-ditor nuk pranohen nga rrjedha standarde.",
                  "Kërkesat që tejkalojnë pragjet aktive të përdorimit mund të bllokohen.",
                  "Pagesat ndaj platformave të palëve të treta nuk rimbursohen nga Pulse AI.",
                ]
              : [
                  "Renewals and payments after the first payment are not eligible for the standard refund flow.",
                  "Requests submitted after the 7-day window are not accepted by the standard flow.",
                  "Requests that exceed the active usage thresholds may be blocked.",
                  "Payments to third-party platforms are not refundable by Pulse AI.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
      </Section>

      <Section id="third-party" title={sections[3].title}>
        <p>{isSq
          ? "Buxhetet e reklamave, tarifat e mesazheve dhe tarifa të tjera që paguhen drejtpërdrejt te ofrues të jashtëm janë marrëdhënie ndërmjet biznesit tuaj dhe atij ofruesi. Pulse AI nuk mund t'i rimbursojë ato pagesa."
          : "Ad budgets, messaging fees, and other charges paid directly to external providers are between your business and that provider. Pulse AI cannot refund those payments."}</p>
      </Section>

      <Section id="cancellation" title={sections[4].title}>
        <p>{isSq
          ? "Mund ta anuloni abonimin për të ndaluar rinovimin e ardhshëm. Anulimi dhe rimbursimi janë procese të ndara; anulimi i abonimit nuk krijon automatikisht të drejtë për rimbursim të një pagese ekzistuese."
          : "You can cancel your subscription to stop the next renewal. Cancellation and refunds are separate processes; cancelling a subscription does not automatically make an existing payment refundable."}</p>
      </Section>

      <Section id="how" title={sections[5].title}>
        <p>{isSq
          ? "Paraqiteni kërkesën përmes rrjedhës së rimbursimit në llogarinë tuaj kur ajo është e disponueshme. Kërkesa regjistrohet për shqyrtim. Për ndihmë me faturimin mund të kontaktoni muslim.brami@gmail.com."
          : "Submit the request through the refund flow in your account when available. The request is recorded for review. For billing assistance, contact muslim.brami@gmail.com."}</p>
      </Section>
    </LegalLayout>
  );
}
