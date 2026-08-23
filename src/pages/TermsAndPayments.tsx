// src/pages/TermsAndPayments.tsx
// Payment Terms — public
//
// LEGAL CONTENT OPEN ITEM: Plan names and specific monthly prices that were
// previously hardcoded here did not match the canonical pricing source
// (public.pricing_settings uses keys: standard / professional / advanced / enterprise).
// Those hardcoded prices have been removed. Current plan details are always
// drawn live from the pricing page and account dashboard.

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
        ["Meta Ads (Facebook/Instagram)", "Buxheti i reklamave — paguhet drejtpërdrejt te Meta. Pulse AI vetëm sinkronizon statistikat."],
        ["Google Ads", "Buxheti i reklamave — paguhet drejtpërdrejt te Google. Pulse AI vetëm lexon ROAS."],
        ["WhatsApp Business API", "Mesazhet template dhe numri i telefonit — paguhen te Meta/BSP."],
        ["Twilio (SMS + Thirrje)", "Kosto për SMS dhe minuta thirrjeje — paguhet drejtpërdrejt te Twilio."],
        ["Resend / SendGrid (Email)", "Email-et mbi nivelin falas — paguhen drejtpërdrejt te Resend."],
        ["Google Workspace", "Drive, Calendar, Gmail — paguhen te Google. Pulse AI vetëm sinkronizon."],
        ["Tarifa e përpunimit Stripe", "2.9% + 30 ALL për transaksion — paguhet te Stripe, jo te Pulse AI."],
      ]
    : [
        ["Meta Ads (Facebook/Instagram)", "Ad budget — paid directly to Meta. Pulse AI only syncs the statistics."],
        ["Google Ads", "Ad budget — paid directly to Google. Pulse AI only reads ROAS."],
        ["WhatsApp Business API", "Template messages and phone number — paid to Meta/BSP."],
        ["Twilio (SMS + Calls)", "Cost per SMS and call minutes — paid directly to Twilio."],
        ["Resend / SendGrid (Email)", "Emails above the free tier — paid directly to Resend."],
        ["Google Workspace", "Drive, Calendar, Gmail — paid to Google. Pulse AI only syncs."],
        ["Stripe processing fee", "2.9% + 30 ALL per transaction — paid to Stripe, not Pulse AI."],
      ];

  const transparencyRows = isSq
    ? [
        ["Abonimi Pulse AI (çdo plan)", "Pulse AI", "✓ brenda 7 ditëve — shih Politikën e Rimbursimit"],
        ["Buxheti Meta Ads", "Meta (Facebook)", "✗ — palë e tretë"],
        ["Buxheti Google Ads", "Google", "✗ — palë e tretë"],
        ["Mesazhet template WhatsApp", "Meta / BSP", "✗ — palë e tretë"],
        ["SMS (Twilio)", "Twilio", "✗ — palë e tretë"],
        ["Email mbi kufirin e përfshirë", "Resend/SendGrid", "✗ — palë e tretë"],
        ["Tarifa e përpunimit Stripe", "Stripe", "✗ — palë e tretë"],
      ]
    : [
        ["Pulse AI subscription (any plan)", "Pulse AI", "✓ within 7 days — see Refund Policy"],
        ["Meta Ads budget", "Meta (Facebook)", "✗ — third party"],
        ["Google Ads budget", "Google", "✗ — third party"],
        ["WhatsApp template messages", "Meta / BSP", "✗ — third party"],
        ["SMS (Twilio)", "Twilio", "✗ — third party"],
        ["Email above included limit", "Resend/SendGrid", "✗ — third party"],
        ["Stripe processing fee", "Stripe", "✗ — third party"],
      ];

  const preapprovalItems = isSq
    ? [
        "Strukturën e kostove me dy nivele (Pulse AI dhe platformat e palëve të treta janë të ndara)",
        "Politikën e rimbursimit — pagesa e parë rimbursohet brenda 7 ditëve për arsye të vlefshme",
        "Që pagesat ndaj Meta, Google, Twilio, etj. janë marrëdhënie e drejtpërdrejtë ndërmjet biznesit dhe atyre kompanive",
        "Që aktivizimi i disa funksioneve (WhatsApp API, sinkronizimi Meta Ads, Google Workspace) kërkon pagesa shtesë ndaj atyre platformave — Pulse AI ofron vetëm integrimet",
        "Që të dhënat e tyre do të ruhen në Supabase me enkriptim AES-GCM dhe nuk do të ndahen me palë të treta pa pëlqim",
      ]
    : [
        "The two-tier cost structure (Pulse AI and third-party platforms are separate)",
        "The refund policy — the first payment is refunded within 7 days for valid reasons",
        "That payments to Meta, Google, Twilio, etc. are a direct relationship between the business and those companies",
        "That enabling certain features (WhatsApp API, Meta Ads sync, Google Workspace) requires additional payments to those platforms — Pulse AI only provides the integrations",
        "That their data will be stored in Supabase with AES-GCM encryption and will not be shared with third parties without consent",
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet e Pagesave" : "Payment Terms"}
      subtitle={isSq
        ? "Struktura e kostove, rregullat e rimbursimit dhe kushtet e miratimit paraprak për abonimet Pulse AI dhe integrimet me palë të treta."
        : "The cost structure, refund rules, and pre-approval terms for Pulse AI subscriptions and third-party integrations."}
      description={isSq
        ? "Kushtet e Pagesave të Pulse AI: struktura e kostos së abonimit, kostot e platformave të palëve të treta, politika e rimbursimit dhe transparenca e kostove."
        : "Pulse AI Payment Terms: subscription cost structure, third-party platform costs, refund policy, and cost transparency."}
      path="/terms-and-payments"
      sections={sections}
    >
      <Section id="structure" title={sections[0].title}>
        <p>{isSq
          ? "Kur regjistrohet në Pulse AI, biznesi pranon të paguajë dy lloje të ndara kostosh:"
          : "When registering with Pulse AI, the business agrees to pay two separate types of costs:"}</p>
        <div className="mt-4 space-y-4">
          <InfoCard title={isSq ? "A — Abonimi Pulse AI (platforma)" : "A — Pulse AI Subscription (the platform)"}>
            {isSq ? "Pagesë mujore ose vjetore për akses në platformën Pulse AI. Detajet dhe çmimet aktuale të planeve merren gjithmonë live nga " : "Monthly or annual payment for access to the Pulse AI platform. Current plan details and prices are always drawn live from the "}
            <Link to={localizedPath("/pricing")} className="text-primary underline">
              {isSq ? "faqja e Çmimeve" : "Pricing page"}
            </Link>
            {isSq
              ? ". Kjo pagesë mbulon: infrastrukturën, modelet AI, bazën e të dhënave, hostimin dhe mbështetjen."
              : ". This payment covers: infrastructure, AI models, database, hosting, and support."}
          </InfoCard>
          <InfoCard title={isSq ? "B — Kostot e Platformave të Palëve të Treta (jo Pulse AI)" : "B — Third-party Platform Costs (not Pulse AI)"}>
            <p className="mb-3">
              {isSq ? <>Këto janë pagesa që bëhen <strong>drejtpërdrejt ndaj kompanive të palëve të treta</strong> dhe <strong>nuk janë pjesë e Pulse AI</strong>:</> : <>These are payments made <strong>directly to third-party companies</strong> and are <strong>not part of Pulse AI</strong>:</>}
            </p>
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
            <p className="font-medium text-green-800 dark:text-green-400 mb-2">{isSq ? "✓ Çfarë rimbursohet" : "✓ What is refundable"}</p>
            <ul className="text-sm text-green-700 dark:text-green-300 space-y-1.5">
              <li>• {isSq ? <>Pagesa e parë e abonimit brenda <strong>7 ditëve</strong> nëse platforma nuk funksionoi për shkak të fajit tonë</> : <>The first subscription payment within <strong>7 days</strong> if the platform did not work due to our fault</>}</li>
              <li>• {isSq ? <>Periudha e papërdorur nëse Pulse AI ka ndërprerje teknike &gt; 48 orë të vazhdueshme</> : <>The unused period if Pulse AI has technical downtime &gt; 48 continuous hours</>}</li>
              <li>• {isSq ? "Gabime të verifikuara faturimi (pagesë e dyfishtë, shumë e pasaktë)" : "Verified billing errors (duplicate charge, incorrect amount)"}</li>
            </ul>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-5">
            <p className="font-medium text-red-800 dark:text-red-400 mb-2">{isSq ? "✗ Çfarë NUK rimbursohet" : "✗ What is NOT refundable"}</p>
            <ul className="text-sm text-red-700 dark:text-red-300 space-y-1.5">
              <li>• {isSq ? <><strong>Pagesat ndaj platformave të palëve të treta</strong> (Meta Ads, Google Ads, Twilio, Resend, tarifat Stripe) — janë jashtë kontrollit tonë</> : <><strong>Payments made to third-party platforms</strong> (Meta Ads, Google Ads, Twilio, Resend, Stripe fees) — these are outside our control</>}</li>
              <li>• {isSq ? "Abonimi mujor pas ditës së 7-të, pavarësisht arsyes" : "Monthly subscription after day 7, regardless of the reason"}</li>
              <li>• {isSq ? "Kostot e krijuara gjatë përdorimit aktiv (thirrje AI, dërgime email-esh, SMS)" : "Costs incurred during active usage (AI calls, email sends, SMS)"}</li>
              <li>• {isSq ? <><strong>Pagesat e bëra me miratim të shprehur</strong> gjatë onboarding</> : <>Payments made with <strong>explicit approval</strong> during onboarding</>}</li>
              <li>• {isSq ? "Periudhat kur biznesi kishte akses aktiv por zgjodhi të mos e përdorte" : "Periods where the business had active access but chose not to use it"}</li>
            </ul>
          </div>
          <InfoCard title={isSq ? 'Rastet "morale ose ligjore"' : '"Moral or legal" cases'}>
            {isSq
              ? <>Nëse biznesi kërkon rimbursim për arsye ligjore ose etike, Pulse AI shqyrton çdo rast individualisht. Megjithatë, <strong>pagesat e bëra ndaj platformave të palëve të treta</strong> (Meta, Google, Twilio, etj.) janë jashtë juridiksionit tonë dhe duhet të kërkohen drejtpërdrejt nga ato kompani. Pagesa e abonimit Pulse AI rimbursohet vetëm nëse verifikohet se platforma ka shkaktuar dëm të drejtpërdrejtë dhe të verifikueshëm — jo thjesht pakënaqësi subjektive.</>
              : <>If the business requests a refund for legal or ethical reasons, Pulse AI reviews each case individually. However, <strong>payments made to third-party platforms</strong> (Meta, Google, Twilio, etc.) are outside our jurisdiction and must be requested directly from those companies. The Pulse AI subscription payment is refunded only if it is verified that the platform caused direct, verifiable damage — not merely subjective dissatisfaction.</>}
          </InfoCard>
        </div>
      </Section>

      <Section id="preapproval" title={sections[2].title}>
        <p>{isSq ? <>Kur biznesi klikon <strong>"Fillo Provën Falas"</strong> ose <strong>"Abonohu"</strong>, ai pranon:</> : <>When the business clicks <strong>"Start Free Trial"</strong> or <strong>"Subscribe"</strong>, they agree to:</>}</p>
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
          {isSq ? "Çmimet aktuale të abonimeve Pulse AI shfaqen live në " : "Current Pulse AI subscription prices are shown live on the "}
          <Link to={localizedPath("/pricing")} className="text-primary underline">
            {isSq ? "faqen e Çmimeve" : "Pricing page"}
          </Link>
          {isSq ? ". Në këtë dokument nuk ka çmime planesh të hardcode-uara." : ". No plan prices are hard-coded in this document."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Kostoja" : "Cost"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Paguhet te" : "Paid to"}</th>
                <th className="text-left py-2 font-medium">{isSq ? "Rimbursohet?" : "Refundable?"}</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {transparencyRows.map(([cost, to, refund]) => (
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
          {isSq ? "Për pyetje rreth pagesave:" : "For questions about payments:"} <strong>info@mso.re</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}
