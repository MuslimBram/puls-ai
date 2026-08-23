import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export default function AffiliateTerms() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";

  const sections: LegalSection[] = isSq
    ? [
        { id: "programs", title: "1. Programet e referimit dhe partneritetit" },
        { id: "commission", title: "2. Rregullat e komisionit të partnerit" },
        { id: "rate", title: "3. Norma e komisionit" },
        { id: "payouts", title: "4. Konfirmimi dhe pagesat" },
        { id: "conduct", title: "5. Sjellja dhe praktikat e ndaluara" },
        { id: "termination", title: "6. Përfundimi" },
      ]
    : [
        { id: "programs", title: "1. Referral and partner programs" },
        { id: "commission", title: "2. Partner commission rules" },
        { id: "rate", title: "3. Commission rate" },
        { id: "payouts", title: "4. Confirmation and payouts" },
        { id: "conduct", title: "5. Conduct and prohibited practices" },
        { id: "termination", title: "6. Termination" },
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet për Referime & Partnerë" : "Referral & Partner Terms"}
      subtitle={isSq
        ? "Si ndahen referimet e zakonshme të biznesit nga komisionet e partnerëve dhe cilat rregulla zbatohen për pagesën e parë."
        : "How ordinary business referrals differ from partner commissions and which rules apply to first-payment commissions."}
      description={isSq
        ? "Kushtet e Pulse AI për referimet dhe partnerët: programet e ndara, komisioni vetëm mbi pagesën e parë dhe norma e konfiguruar për llogarinë aktive të partnerit."
        : "Pulse AI referral and partner terms: separate programs, first-payment-only commissions, and the rate configured for the active partner account."}
      path="/affiliate-terms"
      sections={sections}
    >
      <Section id="programs" title={sections[0].title}>
        <p>{isSq
          ? "Pulse AI ka mekanizma të ndryshëm për referimet e zakonshme të përdoruesve dhe për llogaritë e partnerëve. Një kod referimi biznesi mund të ketë shpërblimin e vet aktiv, ndërsa komisioni i partnerit menaxhohet nga llogaria dhe kushtet e partnerit. Këto dy programe nuk duhet të interpretohen si i njëjti shpërblim."
          : "Pulse AI has separate mechanisms for ordinary user referrals and partner accounts. A business referral code may have its own active reward, while partner commission is governed by the partner account and partner terms. These programs should not be interpreted as the same reward."}</p>
      </Section>

      <Section id="commission" title={sections[1].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Komisioni i partnerit gjenerohet vetëm mbi pagesën e parë të suksesshme të workspace-it të referuar.",
                "Rinovimet, upgrade-et dhe pagesat e përsëritura nuk gjenerojnë komision të ri në rrjedhën standarde të partnerit.",
                "Partneri duhet të ketë llogari aktive dhe referimi duhet të jetë i atribuar te partneri përkatës.",
                "Çdo komision regjistrohet vetëm një herë për kombinimin partner + workspace për pagesën e parë.",
              ]
            : [
                "Partner commission is generated only on the first successful payment of the referred workspace.",
                "Renewals, upgrades, and recurring payments do not generate a new commission in the standard partner flow.",
                "The partner must have an active account and the referral must be attributed to that partner.",
                "A first-payment commission is recorded only once for each partner + workspace combination.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="rate" title={sections[2].title}>
        <InfoCard title={isSq ? "Normë e konfiguruar, jo përqindje publike fikse" : "Configured rate, not a fixed public percentage"}>
          <p>{isSq
            ? "Norma e komisionit merret nga llogaria aktive e partnerit dhe mund të ndryshojë sipas marrëveshjes ose konfigurimit të partnerit. Ky dokument nuk premton një përqindje fikse ose komision për gjithë kohëzgjatjen e abonimit."
            : "The commission rate is taken from the active partner account and may vary by partner agreement or configuration. This document does not promise a fixed percentage or lifetime recurring commission."}</p>
        </InfoCard>
      </Section>

      <Section id="payouts" title={sections[3].title}>
        <p>{isSq
          ? "Komisionet e krijuara regjistrohen në sistemin e partnerit dhe i nënshtrohen statusit të komisionit, verifikimit të pagesës burimore dhe rregullave aktive të pagesës së partnerit. Shuma e shfaqur në llogarinë e partnerit është burimi operacional për komisionin përkatës."
          : "Generated commissions are recorded in the partner system and remain subject to commission status, verification of the source payment, and the active partner payout rules. The amount shown in the partner account is the operational source for that commission."}</p>
      </Section>

      <Section id="conduct" title={sections[4].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Nuk lejohet spam-i, mesazhet masive të pakërkuara ose reklamat mashtruese.",
                "Nuk lejohen llogari të rreme, vetë-referime ose regjistrime të stimuluara që nuk synojnë ta përdorin produktin.",
                "Nuk lejohen premtime për rezultate të garantuara të të ardhurave në emër të Pulse AI.",
                "Partneri nuk duhet të reklamojë një normë komisioni ose shpërblimi që nuk përputhet me konfigurimin e tij aktiv."
              ]
            : [
                "No spam, unsolicited bulk messaging, or misleading advertising.",
                "No fake accounts, self-referrals, or incentivised sign-ups that do not intend to use the product.",
                "No promises of guaranteed revenue results on behalf of Pulse AI.",
                "A partner must not advertise a commission or reward rate that does not match their active configuration."
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="termination" title={sections[5].title}>
        <p>{isSq
          ? "Secila palë mund ta përfundojë partneritetin sipas kushteve të llogarisë ose marrëveshjes së partnerit. Komisionet mbeten subjekt i statusit dhe verifikimit të tyre në sistem; referimet mashtruese ose shkeljet e politikave mund të çojnë në pezullim ose mbyllje të llogarisë së partnerit."
          : "Either side may end the partnership under the partner account or agreement terms. Commissions remain subject to their recorded status and verification in the system; fraudulent referrals or policy violations may result in suspension or closure of the partner account."}</p>
      </Section>
    </LegalLayout>
  );
}
