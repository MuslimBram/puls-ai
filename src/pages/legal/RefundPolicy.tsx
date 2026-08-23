import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function RefundPolicy() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "timeline", title: "1. Afati i rimbursimit" },
        { id: "eligible", title: "2. Çfarë rimbursohet" },
        { id: "not-eligible", title: "3. Çfarë nuk rimbursohet" },
        { id: "third-party", title: "4. Tarifat e palëve të treta" },
        { id: "cancellation", title: "5. Anulimi i abonimit" },
        { id: "how", title: "6. Si të kërkoni rimbursim" },
      ]
    : [
        { id: "timeline", title: "1. Refund timeline" },
        { id: "eligible", title: "2. What is refundable" },
        { id: "not-eligible", title: "3. What is not refundable" },
        { id: "third-party", title: "4. Third-party charges" },
        { id: "cancellation", title: "5. Cancelling a subscription" },
        { id: "how", title: "6. How to request a refund" },
      ];

  const timeline = isSq
    ? [
        ["Ditët 0–7", "Pagesa e parë e abonimit", "Rimbursim i plotë nëse platforma nuk funksionoi siç përshkruhet për shkak të fajit tonë."],
        ["Ditët 8–30", "Periudha aktuale e faturimit", "Shqyrtim rast pas rasti për gabime të verifikuara faturimi ose ndërprerje më të gjata se 48 orë të vazhdueshme."],
        ["Pas 30 ditësh", "Periudhat e kaluara", "Nuk rimbursohen. Mund ta anuloni abonimin për të ndaluar rinovimin e ardhshëm."],
      ]
    : [
        ["Days 0–7", "First subscription payment", "Full refund if the platform did not work as described due to our fault."],
        ["Days 8–30", "Current billing period", "Case-by-case review for verified billing errors or outages longer than 48 continuous hours."],
        ["After 30 days", "Past periods", "Not refundable. You can cancel to stop the next renewal."],
      ];

  return (
    <LegalLayout
      title={isSq ? "Rimbursimi & Anulimi" : "Refund & Cancellation"}
      subtitle={isSq
        ? "Kur mund të rimbursohet një pagesë abonimi në Pulse AI, çfarë është jashtë kontrollit tonë dhe si të anuloni."
        : "When a Pulse AI subscription payment can be refunded, what falls outside our control, and how to cancel."}
      description={isSq
        ? "Politika e rimbursimit dhe anulimit e Pulse AI: afati 7-ditor për pagesën e parë, rimbursimet për gabime faturimi, tarifat e palëve të treta dhe si të anuloni abonimin."
        : "Pulse AI refund and cancellation policy: 7-day first-payment refund window, billing-error refunds, third-party charges, and how to cancel a subscription."}
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
        <InfoCard title={isSq ? "Rastet e pranueshme" : "Eligible scenarios"} tone="positive">
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Pagesa e parë e abonimit brenda 7 ditëve nëse platforma nuk funksionoi për shkak të fajit tonë.",
                  "Periudha e papërdorur kur Pulse AI ka ndërprerje më të gjatë se 48 orë të vazhdueshme.",
                  "Gabime të verifikuara faturimi, si pagesa të dyfishta ose shumë e pasaktë.",
                ]
              : [
                  "The first subscription payment within 7 days if the platform did not work due to our fault.",
                  "The unused period when Pulse AI has downtime longer than 48 continuous hours.",
                  "Verified billing errors such as duplicate charges or an incorrect amount.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
      </Section>

      <Section id="not-eligible" title={sections[2].title}>
        <InfoCard title={isSq ? "Nuk kualifikohen" : "Not eligible"} tone="warning">
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Pagesat e bëra te platformat e palëve të treta (Meta Ads, Google Ads, Twilio, Resend, tarifa pagesash).",
                  "Tarifat mujore të abonimit pas ditës së 7-të të pagesës së parë.",
                  "Kostot sipas përdorimit që janë konsumuar tashmë, si thirrjet AI, SMS dhe dërgimet e email-eve.",
                  "Periudhat kur aksesi ishte aktiv por nuk u përdor.",
                ]
              : [
                  "Payments made to third-party platforms (Meta Ads, Google Ads, Twilio, Resend, payment fees).",
                  "Monthly subscription fees after day 7 of the first payment.",
                  "Usage-based costs already consumed, such as AI calls, SMS and email sends.",
                  "Periods where access was active but unused.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
      </Section>

      <Section id="third-party" title={sections[3].title}>
        <p>{isSq
          ? "Buxhetet e reklamave dhe tarifat e mesazheve janë marrëdhënie e drejtpërdrejtë ndërmjet biznesit tuaj dhe atyre ofruesve. Kërkesat për rimbursim të këtyre shumave duhet t'i bëhen ofruesit; Pulse AI nuk ka autoritet mbi to dhe vetëm sinkronizon statistikat përkatëse."
          : "Ad budgets and messaging fees are a direct relationship between your business and those providers. Refund requests for those amounts must be made to the provider; Pulse AI has no authority over them and only synchronises the resulting statistics."}</p>
      </Section>

      <Section id="cancellation" title={sections[4].title}>
        <p>{isSq
          ? "Mund ta anuloni abonimin në çdo kohë nga faqja e faturimit. Nuk ka tarifë anulimi. Aksesi vazhdon deri në fund të periudhës së paguar, pas së cilës llogaria kalon në vetëm-lexim. Mund t'i eksportoni të dhënat për 30 ditë para fshirjes."
          : "You can cancel at any time from the billing page. There is no cancellation fee. Access continues until the end of the paid period, after which the account moves to read-only. You can export your data for 30 days before deletion."}</p>
      </Section>

      <Section id="how" title={sections[5].title}>
        <p>{isSq
          ? "Dërgoni email në info@mso.re me emrin e workspace-it, numrin e faturës dhe një përshkrim të shkurtër të problemit. Ne konfirmojmë marrjen brenda dy ditëve pune dhe, kur miratohet, rimbursimi kthehet në metodën fillestare të pagesës brenda 5–10 ditëve bankare."
          : "Email info@mso.re with your workspace name, invoice number and a short description of the issue. We acknowledge within two business days and, where approved, refunds are returned to the original payment method within 5–10 banking days."}</p>
      </Section>
    </LegalLayout>
  );
}
