import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function DPA() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "parties", title: "1. Palët dhe fusha e zbatimit" },
        { id: "subject", title: "2. Objekti i përpunimit" },
        { id: "obligations", title: "3. Detyrimet e përpunuesit" },
        { id: "subprocessors", title: "4. Nën-përpunuesit" },
        { id: "security", title: "5. Masat teknike dhe organizative" },
        { id: "transfers", title: "6. Transferimet ndërkombëtare" },
        { id: "breach", title: "7. Njoftimi për shkelje" },
        { id: "deletion", title: "8. Kthimi dhe fshirja" },
        { id: "audit", title: "9. Auditimet" },
      ]
    : [
        { id: "parties", title: "1. Parties and scope" },
        { id: "subject", title: "2. Subject matter of processing" },
        { id: "obligations", title: "3. Processor obligations" },
        { id: "subprocessors", title: "4. Sub-processors" },
        { id: "security", title: "5. Technical and organisational measures" },
        { id: "transfers", title: "6. International transfers" },
        { id: "breach", title: "7. Breach notification" },
        { id: "deletion", title: "8. Return and deletion" },
        { id: "audit", title: "9. Audits" },
      ];

  const subprocessors = isSq
    ? [
        ["Supabase", "Bazë të dhënash, autentikim, storage, funksione", "BE (Frankfurt)"],
        ["Stripe / PayPal", "Përpunimi i pagesave", "BE / SHBA (SCC)"],
        ["Resend", "Dërgimi i email-eve transaksionale", "BE / SHBA (SCC)"],
        ["Twilio", "SMS dhe zë", "BE / SHBA (SCC)"],
        ["Meta / Google", "Kanalet dhe reklamat që lidhni shprehimisht", "BE / SHBA (SCC)"],
        ["Ofruesit AI", "Gjenerimi i përgjigjeve dhe përmbledhjeve të asistentit", "BE / SHBA (SCC)"],
      ]
    : [
        ["Supabase", "Database, authentication, storage, functions", "EU (Frankfurt)"],
        ["Stripe / PayPal", "Payment processing", "EU / US (SCCs)"],
        ["Resend", "Transactional email delivery", "EU / US (SCCs)"],
        ["Twilio", "SMS and voice", "EU / US (SCCs)"],
        ["Meta / Google", "Channels and ads you explicitly connect", "EU / US (SCCs)"],
        ["AI providers", "Generating assistant replies and summaries", "EU / US (SCCs)"],
      ];

  return (
    <LegalLayout
      title={isSq ? "Marrëveshja e Përpunimit të të Dhënave" : "Data Processing Agreement"}
      subtitle={isSq
        ? "Për klientët biznes që kanë nevojë për një DPA me shkrim sipas Nenit 28 të GDPR kur përdorin Pulse AI si përpunues."
        : "For business customers who need a written DPA under Article 28 GDPR when using Pulse AI as a processor."}
      description={isSq
        ? "Marrëveshja e Përpunimit të të Dhënave e Pulse AI: rolet, fusha e përpunimit, nën-përpunuesit, masat e sigurisë, transferimet ndërkombëtare, njoftimi për shkelje, fshirja dhe të drejtat e auditimit."
        : "Pulse AI Data Processing Agreement: roles, processing scope, sub-processors, security measures, international transfers, breach notification, deletion and audit rights."}
      path="/dpa"
      sections={sections}
    >
      <Section id="parties" title={sections[0].title}>
        <p>{isSq
          ? "Kjo marrëveshje zbatohet ndërmjet klientit (kontrolluesit) dhe Pulse AI (përpunuesit) për të dhënat personale që klienti ngarkon ose lidh me platformën. Ajo plotëson Kushtet e Shërbimit dhe hyn në fuqi kur klienti fillon të përdorë shërbimin."
          : "This agreement applies between the customer (controller) and Pulse AI (processor) for personal data that the customer uploads or connects to the platform. It supplements the Terms of Service and takes effect when the customer starts using the service."}</p>
        <InfoCard title={isSq ? "Ju duhet një kopje e nënshkruar?" : "Need a signed copy?"}>
          {isSq
            ? "Përdorni butonin \"Shkarko PDF\" më sipër dhe dërgojeni dokumentin e nënshkruar në info@mso.re. Ne e kundërnënshkruajmë dhe e kthejmë brenda pesë ditëve pune."
            : "Use the \"Download PDF\" button above and email the signed document to info@mso.re. We counter-sign and return it within five business days."}
        </InfoCard>
      </Section>

      <Section id="subject" title={sections[1].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                ["Kohëzgjatja", "për periudhën e abonimit plus periudhën e fshirjes."],
                ["Natyra dhe qëllimi", "hostimi, ruajtja dhe përpunimi i të dhënave CRM, mesazheve dhe marketingut për të ofruar shërbimin."],
                ["Kategoritë e subjekteve të të dhënave", "stafi, kontaktet, lead-et dhe klientët fundorë të klientit."],
                ["Kategoritë e të dhënave", "të dhëna identiteti dhe kontakti, përmbajtja e bisedave, regjistrat tregtarë, identifikuesit teknikë."],
                ["Kategoritë e veçanta", "nuk synohen; klienti nuk duhet të ngarkojë të dhëna të tilla pa bazë ligjore të vlefshme dhe njoftim paraprak."],
              ]
            : [
                ["Duration", "for the term of the subscription plus the deletion period."],
                ["Nature and purpose", "hosting, storing and processing CRM, messaging and marketing data to deliver the service."],
                ["Categories of data subjects", "the customer's staff, contacts, leads and end customers."],
                ["Categories of data", "identity and contact details, conversation content, commercial records, technical identifiers."],
                ["Special categories", "not intended; the customer must not upload such data without a valid legal basis and prior notice."],
              ]).map(([label, body]) => <li key={label}><strong>{label}:</strong> {body}</li>)}
        </ul>
      </Section>

      <Section id="obligations" title={sections[2].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Përpunon të dhënat personale vetëm sipas udhëzimeve të dokumentuara të kontrolluesit.",
                "Siguron që personeli me akses të jetë i detyruar nga konfidencialiteti.",
                "Ndihmon me kërkesat e subjekteve të të dhënave dhe detyrimet sipas Neneve 32–36.",
                "Vë në dispozicion informacionin e nevojshëm për të demonstruar pajtueshmërinë.",
              ]
            : [
                "Process personal data only on documented instructions from the controller.",
                "Ensure personnel with access are bound by confidentiality.",
                "Assist with data subject requests and with Articles 32–36 obligations.",
                "Make available the information needed to demonstrate compliance.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="subprocessors" title={sections[3].title}>
        <p>{isSq ? "Kontrolluesi autorizon nën-përpunuesit e mëposhtëm. Ndryshimet njoftohen të paktën 14 ditë paraprakisht." : "The controller authorises the following sub-processors. Changes are announced at least 14 days in advance."}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Nën-përpunuesi" : "Sub-processor"}</th>
                <th className="text-left py-2 pr-4 font-medium">{isSq ? "Qëllimi" : "Purpose"}</th>
                <th className="text-left py-2 font-medium">{isSq ? "Vendndodhja" : "Location"}</th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map(([name, purpose, location]) => (
                <tr key={name} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{name}</td>
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2">{location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="security" title={sections[4].title}>
        <p>{isSq
          ? "Masat përfshijnë TLS 1.2+ gjatë transmetimit, enkriptim në ruajtje, AES-256-GCM për kredencialet e ruajtura, Row Level Security për çdo workspace, kontroll aksesi të bazuar në role, autentikim opsional me dy faktorë, audit logging, rate limiting, webhook-e të nënshkruara dhe backup-e ditore. Detajet përshkruhen në Përmbledhjen e Sigurisë."
          : "Measures include TLS 1.2+ in transit, encryption at rest, AES-256-GCM for stored credentials, Row Level Security per workspace, role-based access control, optional two-factor authentication, audit logging, rate limiting, signed webhooks and daily backups. Details are described in the Security Overview."}</p>
      </Section>

      <Section id="transfers" title={sections[5].title}>
        <p>{isSq
          ? "Përpunimi kryesor kryhet në Bashkimin Evropian. Kur një nën-përpunues përpunon të dhëna jashtë EEA-së, transferimet mbështeten në Klauzolat Kontraktuale Standarde të Komisionit Evropian së bashku me masa plotësuese."
          : "Primary processing takes place in the European Union. Where a sub-processor processes data outside the EEA, transfers rely on the European Commission's Standard Contractual Clauses together with supplementary measures."}</p>
      </Section>

      <Section id="breach" title={sections[6].title}>
        <p>{isSq
          ? "Pulse AI njofton kontrolluesin pa vonesë të panevojshme dhe brenda 72 orëve nga momenti kur merr dijeni për një shkelje të të dhënave personale, duke përfshirë natyrën e incidentit, pasojat e mundshme dhe masat e marra."
          : "Pulse AI notifies the controller without undue delay and within 72 hours of becoming aware of a personal data breach, including the nature of the incident, likely consequences and the measures taken."}</p>
      </Section>

      <Section id="deletion" title={sections[7].title}>
        <p>{isSq
          ? "Pas përfundimit, kontrolluesi mund t'i eksportojë të dhënat për 30 ditë. Pas kësaj, të dhënat personale fshihen nga sistemet e prodhimit brenda 30 ditëve dhe nga backup-et brenda 90 ditëve, përveç rasteve kur ruajtja kërkohet nga ligji."
          : "On termination the controller may export data for 30 days. After that, personal data is deleted from production systems within 30 days and from backups within 90 days, except where retention is required by law."}</p>
      </Section>

      <Section id="audit" title={sections[8].title}>
        <p>{isSq
          ? "Kontrolluesi mund të kërkojë dokumentacion për masat e mësipërme një herë në vit ose pas një incidenti të raportuar. Auditime në vend organizohen me njoftim të arsyeshëm dhe nuk duhet të ndërpresin operacionet ose të ekspozojnë të dhënat e klientëve të tjerë."
          : "The controller may request documentation of the measures above once per year, or after a reported incident. On-site audits are arranged with reasonable notice and must not disrupt operations or expose other customers' data."}</p>
      </Section>
    </LegalLayout>
  );
}
