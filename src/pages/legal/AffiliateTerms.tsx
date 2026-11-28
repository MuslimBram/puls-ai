import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";
import { usePublicLocale } from "@/hooks/usePublicLocale";
import { COMMISSION_POLICY as P, COMMISSION_POLICY_VERSION, policyCopy } from "@/config/commissionPolicy";

export default function AffiliateTerms() {
  const { locale } = usePublicLocale();
  const isSq = locale === "sq";
  const copy = policyCopy(isSq);

  const sections: LegalSection[] = isSq
    ? [
        { id: "programs", title: "1. Programet e referimit dhe partneritetit" },
        { id: "commission", title: "2. Rregullat e komisionit të partnerit" },
        { id: "rate", title: "3. Normat zyrtare të komisionit" },
        { id: "payouts", title: "4. Konfirmimi dhe pagesat" },
        { id: "conduct", title: "5. Sjellja dhe praktikat e ndaluara" },
        { id: "termination", title: "6. Përfundimi" },
      ]
    : [
        { id: "programs", title: "1. Referral and partner programs" },
        { id: "commission", title: "2. Partner commission rules" },
        { id: "rate", title: "3. Official commission rates" },
        { id: "payouts", title: "4. Confirmation and payouts" },
        { id: "conduct", title: "5. Conduct and prohibited practices" },
        { id: "termination", title: "6. Termination" },
      ];

  return (
    <LegalLayout
      title={isSq ? "Kushtet për Referime & Partnerë" : "Referral & Partner Terms"}
      subtitle={isSq
        ? "Programi i referimit, Freelancer-i dhe Ambasadori: çfarë paguhet, kur paguhet dhe kur kthehet."
        : "Referral Program, Freelancer and Ambassador: what is paid, when it is paid and when it is reversed."}
      description={isSq
        ? `Kushtet e Pulse AI për referimet dhe partnerët: ${P.referral.firstPaymentPercent}% referim në pagesën e parë, ${P.freelancer.managementFeeSharePercent}% e tarifave të menaxhimit për Freelancer-in dhe ${P.ambassador.lifetimeRecurringPercent}% jetësor për Ambasadorin.`
        : `Pulse AI referral and partner terms: ${P.referral.firstPaymentPercent}% referral on the first payment, ${P.freelancer.managementFeeSharePercent}% of management fees for Freelancers and ${P.ambassador.lifetimeRecurringPercent}% lifetime for Ambassadors.`}
      path="/affiliate-terms"
      sections={sections}
    >
      <Section id="programs" title={sections[0].title}>
        <p>{isSq
          ? "Pulse AI ka tre programe të ndara: Programin e referimit (çdo përdorues), Freelancer-in (sjell dhe, kur biznesi e autorizon, menaxhon biznese) dhe Ambasadorin (sjell biznese pa i menaxhuar). Një biznes i referuar i atribuohet vetëm një programi; komisionet e programeve të ndryshme nuk kombinohen dhe nuk numërohen dy herë."
          : "Pulse AI has three separate programs: the Referral Program (any user), Freelancer (brings in and, when the business authorizes it, manages businesses) and Ambassador (brings in businesses without managing them). A referred business is attributed to one program only; commissions from different programs are never combined or counted twice."}</p>
      </Section>

      <Section id="commission" title={sections[1].title}>
        <ul className="list-disc pl-5 space-y-1.5">
          {(isSq
            ? [
                "Komisioni llogaritet mbi shumën e paguar realisht (pas zbritjeve), në monedhën e pagesës.",
                "Pagesat e papaguara, të dështuara, të rimbursuara ose të kontestuara nuk gjenerojnë komision.",
                `Çdo komision i ri pret ${P.refundWindowDays} ditë (afati i rimbursimit) para miratimit. Rimbursimi ose chargeback-u e anulon ose e kthen komisionin; historiku ruhet.`,
                "Vetë-referimi (referimi i biznesit tuaj ose i një workspace ku jeni anëtar) nuk lejohet dhe nuk paguhet.",
                "Partnerët e pezulluar ose me sinjalizime mashtrimi të hapura nuk marrin miratim deri në verifikim.",
                "Çdo komision regjistrohet vetëm një herë për çdo pagesë burimore; dërgimet e përsëritura të pagesës nuk e dyfishojnë.",
              ]
            : [
                "Commission is calculated on the amount actually paid (after discounts), in the payment currency.",
                "Unpaid, failed, refunded or disputed payments never generate a commission.",
                `Every new commission waits ${P.refundWindowDays} days (refund window) before approval. A refund or chargeback cancels or reverses the commission; history is kept.`,
                "Self-referral (referring your own business or a workspace you are a member of) is not allowed and is not paid.",
                "Suspended partners, or partners with open fraud flags, are not approved until verified.",
                "Each commission is recorded only once per source payment; repeated payment notifications never duplicate it.",
              ]).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </Section>

      <Section id="rate" title={sections[2].title}>
        <InfoCard title={isSq ? `Politika zyrtare (${COMMISSION_POLICY_VERSION})` : `Official policy (${COMMISSION_POLICY_VERSION})`}>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{copy.referral}</li>
            <li>{copy.freelancer}</li>
            <li>{copy.ambassador}</li>
          </ul>
          <p className="mt-2 text-xs">{isSq
            ? "Komisionet e krijuara para hyrjes në fuqi të kësaj politike mbeten sipas rregullave të atëhershme dhe nuk rillogariten."
            : "Commissions created before this policy took effect keep the rules that applied then and are not recalculated."}</p>
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
