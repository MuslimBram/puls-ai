import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function TermsOfService() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "agreement", title: "1. Marrëveshja" },
        { id: "accounts", title: "2. Llogaritë dhe pranueshmëria" },
        { id: "plans", title: "3. Planet, prova dhe faturimi" },
        { id: "acceptable-use", title: "4. Përdorimi i pranueshëm" },
        { id: "third-party", title: "5. Platformat e palëve të treta" },
        { id: "ai", title: "6. Përmbajtja e gjeneruar nga AI" },
        { id: "ip", title: "7. Pronësia intelektuale" },
        { id: "liability", title: "8. Përgjegjësia dhe garancitë" },
        { id: "termination", title: "9. Pezullimi dhe përfundimi" },
        { id: "law", title: "10. Ligji zbatues dhe ndryshimet" },
      ]
    : [
        { id: "agreement", title: "1. The agreement" },
        { id: "accounts", title: "2. Accounts and eligibility" },
        { id: "plans", title: "3. Plans, trial and billing" },
        { id: "acceptable-use", title: "4. Acceptable use" },
        { id: "third-party", title: "5. Third-party platforms" },
        { id: "ai", title: "6. AI-generated output" },
        { id: "ip", title: "7. Intellectual property" },
        { id: "liability", title: "8. Liability and warranties" },
        { id: "termination", title: "9. Suspension and termination" },
        { id: "law", title: "10. Governing law and changes" },
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet e Shërbimit" : "Terms of Service"}
      subtitle={isSq
        ? "Rregullat që drejtojnë përdorimin tuaj të Pulse AI, përfshirë abonimet, përdorimin e pranueshëm dhe përgjegjësinë."
        : "The rules that govern your use of Pulse AI, including subscriptions, acceptable use and liability."}
      description={isSq
        ? "Kushtet e Shërbimit të Pulse AI: rregullat e llogarisë, kushtet e abonimit dhe faturimit, përdorimi i pranueshëm, kostot e platformave të treta, rezultatet e AI, përgjegjësia dhe përfundimi."
        : "Pulse AI Terms of Service: account rules, subscription and billing terms, acceptable use, third-party platform costs, AI output, liability and termination."}
      path="/terms"
      sections={sections}
    >
      <Section id="agreement" title={sections[0].title}>
        <p>{isSq
          ? "Këto kushte përbëjnë një marrëveshje detyruese ndërmjet Pulse AI dhe personit ose kompanisë që përdor platformën. Duke krijuar një llogari ose duke klikuar \"Fillo provën falas\", ju i pranoni ato. Nëse i pranoni në emër të një kompanie, konfirmoni se jeni i autorizuar ta bëni këtë."
          : "These terms form a binding agreement between Pulse AI and the person or company using the platform. By creating an account or clicking \"Start free trial\" you accept them. If you accept on behalf of a company, you confirm you are authorised to do so."}</p>
      </Section>

      <Section id="accounts" title={sections[1].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Duhet të jeni të paktën 18 vjeç dhe të jepni të dhëna të sakta regjistrimi.",
                "Verifikimi i email-it është i detyrueshëm para se të jepet akses i plotë.",
                "Ju jeni përgjegjës për aktivitetin e çdo përdoruesi që ftoni në workspace-in tuaj.",
                "Kredencialet nuk duhet të ndahen; sesionet skadojnë automatikisht pas 24 orësh.",
              ]
            : [
                "You must be at least 18 years old and provide accurate registration details.",
                "Email verification is mandatory before full access is granted.",
                "You are responsible for the activity of every user you invite to your workspace.",
                "Credentials must not be shared; sessions expire automatically after 24 hours.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="plans" title={sections[2].title}>
        <InfoCard title={isSq ? "Kushtet kryesore të faturimit" : "Key billing terms"} tone="positive">
          <ul className="list-disc pl-5 space-y-1">
            {(isSq
              ? [
                  "Çdo biznes i ri merr një provë falas 7-ditore me funksionalitet të plotë.",
                  "Abonimet rinovohen automatikisht derisa të anulohen.",
                  "Çmimet shfaqen pa TVSH aty ku aplikohet.",
                  "Zbritje për angazhim: 5% për 3 muaj, 10% për 6 muaj, 20% për 12 muaj.",
                  "White Label: licenca paguhet një herë ose në 6 këste mujore; mirëmbajtja është 20% e licencës në vit. Kodi i plotë pa logo jepet vetëm me kontratë licence, pa të drejtë rishitjeje të kodit.",
                  "Anulimi ndalon rinovimin e ardhshëm; aksesi vazhdon deri në fund të periudhës.",
                ]
              : [
                  "Every new business gets a 7-day free trial with full functionality.",
                  "Subscriptions renew automatically until cancelled.",
                  "Prices are shown excluding VAT where applicable.",
                  "Commitment discounts: 5% for 3 months, 10% for 6 months, 20% for 12 months.",
                  "White Label: the licence is paid once or in 6 monthly instalments; maintenance is 20% of the licence per year. The unbranded full source code is provided only under a licence contract, without the right to resell the code.",
                  "Cancellation stops the next renewal; access continues until the period ends.",
                ]).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </InfoCard>
        <p>{isSq
          ? "Rimbursimet rregullohen nga politika jonë e Rimbursimit & Anulimit. Mospagesa mund të çojë në pezullim pas një periudhe tolerance dhe në fshirjen e llogarive të papaguara pas 30 ditësh."
          : "Refunds are governed by our Refund & Cancellation policy. Failure to pay may lead to suspension after a grace period and deletion of unpaid accounts after 30 days."}</p>
      </Section>

      <Section id="acceptable-use" title={sections[3].title}>
        <p>{isSq ? "Nuk mund ta përdorni Pulse AI për të:" : "You may not use Pulse AI to:"}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Dërguar mesazhe masive të pakërkuara ose shkelur politikat e platformave të mesazheve.",
                "Ngarkuar përmbajtje të paligjshme, që cenon të drejta ose është e dëmshme.",
                "Tentuar të anashkaloni kontrollet e aksesit, kufijtë e përdorimit ose izolimin e workspace-it.",
                "Rishitur platformën pa një marrëveshje të shkruar rishitjeje.",
                "Përpunuar të dhëna personale të kategorive të veçanta pa një bazë të përshtatshme ligjore.",
              ]
            : [
                "Send unsolicited bulk messages or violate messaging-platform policies.",
                "Upload unlawful, infringing or harmful content.",
                "Attempt to bypass access controls, rate limits or workspace isolation.",
                "Resell the platform without a written reseller agreement.",
                "Process special-category personal data without an appropriate legal basis.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="third-party" title={sections[4].title}>
        <InfoCard title={isSq ? "Strukturë kostosh me dy nivele" : "Two-tier cost structure"} tone="warning">
          {isSq
            ? "Abonimi juaj në Pulse AI mbulon vetëm platformën. Buxhetet e reklamave (Meta, Google), tarifat e mesazheve (template WhatsApp, Twilio SMS dhe zë), volumi i email-it mbi nivelin falas dhe tarifat e përpunimit të pagesave faturohen drejtpërdrejt nga ato kompani dhe janë jashtë kontrollit tonë."
            : "Your Pulse AI subscription covers the platform only. Ad budgets (Meta, Google), messaging fees (WhatsApp templates, Twilio SMS and voice), email volume above the free tier and payment-processing fees are billed directly by those companies and are outside our control."}
        </InfoCard>
      </Section>

      <Section id="ai" title={sections[5].title}>
        <p>{isSq
          ? "Funksionet AI prodhojnë sugjerime që mund të jenë të pasakta. Ju mbeteni përgjegjës për rishikimin e përmbajtjes para se ajo t'u dërgohet klientëve ose të përdoret për një vendim biznesi. Ne nuk garantojmë ndonjë rezultat specifik tregtar nga përdorimi i platformës."
          : "AI features produce suggestions that may be inaccurate. You remain responsible for reviewing content before it is sent to customers or used for a business decision. We do not guarantee any specific commercial result from using the platform."}</p>
      </Section>

      <Section id="ip" title={sections[6].title}>
        <p>{isSq
          ? "Pulse AI zotëron platformën, softuerin dhe markën e saj. Ju ruani pronësinë mbi të dhënat dhe përmbajtjen që ngarkoni dhe na jepni licencën e kufizuar që nevojitet për t'i hostuar dhe përpunuar ato për të ofruar shërbimin."
          : "Pulse AI owns the platform, its software and branding. You keep ownership of the data and content you upload, and grant us the limited licence needed to host and process it in order to deliver the service."}</p>
      </Section>

      <Section id="liability" title={sections[7].title}>
        <p>{isSq
          ? "Shërbimi ofrohet në bazën \"siç është\", me përpjekje tregtare të arsyeshme për disponueshmëri. Në masën maksimale të lejuar nga ligji, përgjegjësia jonë e përgjithshme kufizohet në tarifat e abonimit që keni paguar në dymbëdhjetë muajt para kërkesës. Ne nuk mbajmë përgjegjësi për humbje indirekte ose pasuese, përfshirë fitimet e humbura ose kostot e ngarkuara nga platformat e palëve të treta."
          : "The service is provided on an \"as is\" basis with commercially reasonable effort towards availability. To the maximum extent permitted by law, our aggregate liability is limited to the subscription fees you paid in the twelve months preceding the claim. We are not liable for indirect or consequential loss, including lost profits or costs charged by third-party platforms."}</p>
      </Section>

      <Section id="termination" title={sections[8].title}>
        <p>{isSq
          ? "Mund të anuloni në çdo kohë nga faqja e faturimit. Ne mund të pezullojmë ose përfundojmë llogari që shkelin këto kushte, krijojnë rrezik sigurie ose mbeten të papaguara. Pas përfundimit mund t'i eksportoni të dhënat tuaja për 30 ditë, pas së cilës ato fshihen."
          : "You may cancel at any time from the billing page. We may suspend or terminate accounts that breach these terms, create security risk, or remain unpaid. On termination you can export your data for 30 days, after which it is deleted."}</p>
      </Section>

      <Section id="law" title={sections[9].title}>
        <p>{isSq
          ? "Këto kushte rregullohen nga ligjet e Republikës së Shqipërisë, me juridiksion të gjykatave të Tiranës, pa cenuar mbrojtjet detyruese të konsumatorit në vendin tuaj të banimit. Ndryshimet thelbësore njoftohen me email të paktën 14 ditë para hyrjes në fuqi."
          : "These terms are governed by the laws of the Republic of Albania, with the courts of Tirana having jurisdiction, without prejudice to mandatory consumer protections in your country of residence. Material changes are announced by email at least 14 days before taking effect."}</p>
      </Section>
    </LegalLayout>
  );
}
