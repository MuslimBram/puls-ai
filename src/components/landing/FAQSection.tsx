import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_KEYS = [
  "whatIsPulse",
  "howMuch",
  "freeTrial",
  "rolesDifference",
  "referralEarnings",
  "installMobile",
  "afterTrial",
];

export const FAQSection = () => {
  const { t, i18n } = useTranslation();
  const isSq = i18n.resolvedLanguage?.toLowerCase().startsWith("sq") ?? false;

  const productTruthAnswers: Partial<Record<(typeof FAQ_KEYS)[number], string>> = {
    rolesDifference: isSq
      ? "Biznes: menaxhon workspace-in e vet me mjetet e Pulse AI. Freelancer: mund të menaxhojë biznese klientësh dhe marrëdhënie të miratuara partneriteti. Ambasador: fokusohet te referimet. Çdo komision, shpërblim ose përfitim varet nga konfigurimi dhe kushtet aktive të llogarisë; Pulse AI nuk premton një përqindje fikse ose komision jetësor publik."
      : "Business: manages its own workspace with Pulse AI tools. Freelancer: can manage client businesses and approved partner relationships. Ambassador: focuses on referrals. Any commission, reward, or benefit depends on the account's active configuration and terms; Pulse AI does not promise a fixed public percentage or lifetime commission.",
    referralEarnings: isSq
      ? "Ndani linkun ose kodin tuaj të referimit kur llogaria juaj është e pranueshme. Referimet e zakonshme të biznesit dhe komisionet e partnerëve janë programe të ndara. Komisionet e partnerëve në rrjedhën standarde lidhen me pagesën e parë të pranueshme dhe norma merret nga konfigurimi aktiv i partnerit."
      : "Share your referral link or code when your account is eligible. Ordinary business referrals and partner commissions are separate programs. In the standard partner flow, commissions relate to the eligible first payment and the rate comes from the partner's active configuration.",
  };

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="mb-10 text-center animate-on-scroll">
        <h2 className="mb-2 text-3xl font-bold text-foreground">
          {t("landing.faq.title")}
        </h2>
        <p className="text-muted-foreground">{t("landing.faq.desc")}</p>
      </div>
      <div className="mx-auto max-w-2xl animate-on-scroll">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="text-left text-foreground">
                {t(`landing.faq.items.${key}.q`)}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {productTruthAnswers[key] ?? t(`landing.faq.items.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};
