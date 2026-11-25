import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function PrivacyPolicy() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "who-we-are", title: "1. Kush jemi" },
        { id: "data-we-collect", title: "2. Të dhënat që mbledhim" },
        { id: "why", title: "3. Pse i përpunojmë të dhënat" },
        { id: "sharing", title: "4. Ndarja dhe përpunuesit" },
        { id: "storage", title: "5. Ruajtja dhe afatet" },
        { id: "rights", title: "6. Të drejtat tuaja sipas GDPR" },
        { id: "contact", title: "7. Kontakti" },
      ]
    : [
        { id: "who-we-are", title: "1. Who we are" },
        { id: "data-we-collect", title: "2. Data we collect" },
        { id: "why", title: "3. Why we process data" },
        { id: "sharing", title: "4. Sharing and processors" },
        { id: "storage", title: "5. Storage and retention" },
        { id: "rights", title: "6. Your GDPR rights" },
        { id: "contact", title: "7. Contact" },
      ];

  const rights = isSq
    ? [
        ["E drejta e aksesit", "Kërkoni një kopje të të dhënave personale që mbajmë për ju. Përgjigjemi brenda 30 ditëve."],
        ["E drejta e korrigjimit", "Korrigjoni të dhëna të pasakta ose të paplota drejtpërdrejt në cilësimet e llogarisë ose me kërkesë."],
        ["E drejta e fshirjes", "Kërkoni fshirjen e llogarisë dhe të dhënave personale përkatëse. Të dhënat hiqen brenda 30 ditëve, përveç regjistrave që duhet t'i ruajmë për detyrime kontabël ose parandalim mashtrimi."],
        ["E drejta e kufizimit", "Kërkoni që përpunimi të pezullohet ndërsa shqyrtohet një mosmarrëveshje mbi saktësinë ose ligjshmërinë."],
        ["E drejta e bartjes së të dhënave", "Eksportoni kontaktet, bisedat dhe regjistrat CRM në një format të lexueshëm nga makina."],
        ["E drejta e kundërshtimit", "Kundërshtoni përpunimin e bazuar në interes legjitim, përfshirë profilizimin për analitikën e produktit."],
        ["E drejta e tërheqjes së pëlqimit", "Tërhiqni në çdo kohë pëlqimin për përpunim opsional si cookie-t analitike ose email-et e marketingut."],
      ]
    : [
        ["Right of access", "Request a copy of the personal data we hold about you. We respond within 30 days."],
        ["Right to rectification", "Correct inaccurate or incomplete data directly in your account settings or by request."],
        ["Right to erasure", "Ask us to delete your account and associated personal data. Data is removed within 30 days, except records we must keep for accounting or fraud-prevention obligations."],
        ["Right to restriction", "Ask us to pause processing while a dispute about accuracy or lawfulness is reviewed."],
        ["Right to data portability", "Export your contacts, conversations and CRM records in a machine-readable format."],
        ["Right to object", "Object to processing based on legitimate interests, including profiling for product analytics."],
        ["Right to withdraw consent", "Withdraw consent for optional processing such as analytics cookies or marketing emails at any time."],
      ];

  return (
    <LegalLayout
      title={isSq ? "Politika e Privatësisë" : "Privacy Policy"}
      subtitle={isSq
        ? "Si Pulse AI mbledh, përdor, ruan dhe mbron të dhënat personale të bizneseve dhe klientëve të tyre."
        : "How Pulse AI collects, uses, stores and protects personal data for businesses and their customers."}
      description={isSq
        ? "Politika e Privatësisë e Pulse AI: cilat të dhëna personale mbledhim, pse i përpunojmë, ku ruhen, përpunuesit tanë dhe si të ushtroni të drejtat tuaja sipas GDPR."
        : "Pulse AI Privacy Policy: what personal data we collect, why we process it, where it is stored, our processors, and how to exercise your GDPR rights."}
      path="/privacy"
      sections={sections}
    >
      <Section id="who-we-are" title={sections[0].title}>
        <p>{isSq
          ? "Pulse AI është një sistem operativ biznesi që kombinon CRM, inbox shumëkanalësh, automatizim marketingu dhe asistentë AI. Për të dhënat personale që bizneset ngarkojnë në platformë, Pulse AI vepron si përpunues i të dhënave dhe biznesi vepron si kontrollues. Për të dhënat e llogarisë dhe faturimit të klientëve tanë, Pulse AI është kontrolluesi."
          : "Pulse AI is a business operating system that combines CRM, omnichannel inbox, marketing automation and AI assistants. For personal data that businesses upload into the platform, Pulse AI acts as a data processor and the business acts as the data controller. For account and billing data of our own customers, Pulse AI is the controller."}</p>
        <p>{isSq ? "Kontakti për çështje privatësie: muslim.brami@gmail.com" : "Contact for privacy matters: muslim.brami@gmail.com"}</p>
      </Section>

      <Section id="data-we-collect" title={sections[1].title}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InfoCard title={isSq ? "Të dhënat e llogarisë" : "Account data"}>
            {isSq ? "Emri, adresa e email-it, numri i telefonit, hash-i i fjalëkalimit, anëtarësimi në workspace, roli dhe ngjarjet e autentikimit si pajisja e hyrjes dhe adresa IP." : "Name, email address, phone number, password hash, workspace membership, role and authentication events such as login device and IP address."}
          </InfoCard>
          <InfoCard title={isSq ? "Përmbajtja e biznesit" : "Business content"}>
            {isSq ? "Kontaktet, lead-et, marrëveshjet, bisedat nga kanalet e lidhura, dokumentet e bazës së njohurive, përmbajtja e fushatave dhe skedarët që ngarkoni." : "Contacts, leads, deals, conversations from connected channels, knowledge-base documents, campaign content and files you upload."}
          </InfoCard>
          <InfoCard title={isSq ? "Të dhënat e faturimit" : "Billing data"}>
            {isSq ? "Plani, faturat dhe statusi i pagesës. Të dhënat e kartës trajtohen nga ofruesit tanë të pagesave dhe nuk ruhen kurrë në serverët e Pulse AI." : "Plan, invoices and payment status. Card details are handled by our payment providers and never stored on Pulse AI servers."}
          </InfoCard>
          <InfoCard title={isSq ? "Të dhënat teknike" : "Technical data"}>
            {isSq ? "Regjistrat teknikë, gjurmët e gabimeve, numëruesit e përdorimit të funksioneve dhe identifikuesit e cookie-ve të përshkruar në Politikën e Cookie-ve." : "Log records, error traces, feature usage counters and cookie identifiers described in the Cookie Policy."}
          </InfoCard>
        </div>
      </Section>

      <Section id="why" title={sections[2].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Për të ofruar shërbimin për të cilin jeni abonuar (kontratë).",
                "Për të siguruar llogaritë, zbuluar abuzimet dhe parandaluar mashtrimin (interes legjitim).",
                "Për të dërguar mesazhe transaksionale për llogarinë tuaj (kontratë).",
                "Për të përmirësuar cilësinë e produktit duke përdorur statistika të agreguara të përdorimit (interes legjitim).",
                "Për të dërguar lajme dhe oferta të produktit kur keni dhënë pëlqimin (pëlqim).",
                "Për të përmbushur detyrimet kontabël dhe tatimore (detyrim ligjor).",
              ]
            : [
                "To provide the service you subscribed to (contract).",
                "To secure accounts, detect abuse and prevent fraud (legitimate interest).",
                "To send transactional messages about your account (contract).",
                "To improve product quality using aggregated usage statistics (legitimate interest).",
                "To send product news and offers where you opted in (consent).",
                "To meet accounting and tax obligations (legal obligation).",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="sharing" title={sections[3].title}>
        <p>{isSq
          ? "Ne nuk shesim të dhëna personale. Të dhënat i ndajmë vetëm me nën-përpunues të autorizuar që nevojiten për funksionimin e shërbimit, secili nën një marrëveshje për përpunimin e të dhënave: Supabase (bazë të dhënash, autentikim, storage), Stripe dhe PayPal (pagesa), Resend (email transaksional), Twilio (SMS dhe zë), Meta dhe Google (vetëm për kanalet që lidhni shprehimisht), si dhe ofruesit AI që përdoren për të gjeneruar përgjigjet e asistentit."
          : "We do not sell personal data. We share data only with authorised sub-processors that are required to operate the service, each under a data processing agreement: Supabase (database, authentication, storage), Stripe and PayPal (payments), Resend (transactional email), Twilio (SMS and voice), Meta and Google (only for channels you explicitly connect), and AI providers used to generate assistant replies."}</p>
        <p>{isSq
          ? "Të dhënat mund të zbulohen gjithashtu kur kërkohet nga një kërkesë ligjore e vlefshme ose gjatë një bashkimi apo blerjeje, rast në të cilin do të njoftoheni paraprakisht."
          : "Data may also be disclosed where required by a valid legal request, or during a merger or acquisition, in which case you will be notified in advance."}</p>
      </Section>

      <Section id="storage" title={sections[4].title}>
        <p>{isSq
          ? "Të dhënat e prodhimit hostohen në Bashkimin Evropian (rajoni Frankfurt). Të dhënat enkriptohen gjatë transmetimit me TLS 1.2+ dhe në ruajtje, ndërsa kredencialet sensitive ruhen duke përdorur enkriptim AES-256-GCM. Row Level Security izolon çdo workspace në nivel baze të dhënash."
          : "Production data is hosted in the European Union (Frankfurt region). Data is encrypted in transit with TLS 1.2+ and at rest, with sensitive credentials stored using AES-256-GCM encryption. Row Level Security isolates each workspace at the database level."}</p>
        <p>{isSq
          ? "Të dhënat e llogarisë aktive ruhen për sa kohë abonimi juaj është aktiv. Pas fshirjes së llogarisë, të dhënat personale hiqen brenda 30 ditëve; kopjet rezervë hiqen gradualisht brenda 90 ditëve. Faturat ruhen për periudhën që kërkohet nga ligji tatimor."
          : "Active account data is retained while your subscription is active. After account deletion, personal data is removed within 30 days; backups roll off within 90 days. Invoices are kept for the period required by tax law."}</p>
      </Section>

      <Section id="rights" title={sections[5].title}>
        <p>{isSq
          ? "Nëse ndodheni në Zonën Ekonomike Evropiane, keni të drejtat më poshtë. Për të ushtruar cilëndo prej tyre, dërgoni email në muslim.brami@gmail.com nga adresa e lidhur me llogarinë tuaj."
          : "If you are in the European Economic Area, you have the rights below. To exercise any of them, email muslim.brami@gmail.com from the address linked to your account."}</p>
        <Accordion type="single" collapsible className="w-full">
          {rights.map(([title, body]) => (
            <AccordionItem key={title} value={title}>
              <AccordionTrigger className="text-left text-foreground">{title}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{body}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p>{isSq
          ? "Keni gjithashtu të drejtën të paraqisni ankesë pranë autoritetit kombëtar për mbrojtjen e të dhënave."
          : "You also have the right to lodge a complaint with your national data protection authority."}</p>
      </Section>

      <Section id="contact" title={sections[6].title}>
        <p>{isSq
          ? "Për pyetje rreth kësaj politike ose për një kërkesë që lidhet me të dhënat tuaja: muslim.brami@gmail.com. Përgjigjemi brenda 30 ditëve dhe më shpejt kur e kërkon ligji."
          : "Questions about this policy, or a request relating to your data: muslim.brami@gmail.com. We reply within 30 days, and sooner where the law requires it."}</p>
      </Section>
    </LegalLayout>
  );
}
