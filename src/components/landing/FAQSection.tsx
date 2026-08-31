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
] as const;

export const FAQSection = () => {
  const { t, i18n } = useTranslation();
  const isSq = i18n.resolvedLanguage?.toLowerCase().startsWith("sq") ?? false;

  const productTruthAnswers: Partial<Record<(typeof FAQ_KEYS)[number], string>> = {
    howMuch: isSq
      ? "Planet dhe çmimet publike merren nga katalogu aktiv i Pulse AI. Shih faqen Pricing për çmimet, emërtimet dhe kushtet që janë aktualisht në fuqi."
      : "Public plans and prices come from Pulse AI's active product catalog. See the Pricing page for the plans, labels and terms that are currently in effect.",
    freeTrial: isSq
      ? "Pulse AI ofron provë 7-ditore sipas konfigurimit aktiv të regjistrimit dhe planit. Akseset dhe kufijtë realë përcaktohen nga konfigurimi aktiv i produktit."
      : "Pulse AI provides a 7-day trial according to the active registration and plan configuration. Actual access and limits are governed by the active product configuration.",
    rolesDifference: isSq
      ? "Business: menaxhon biznesin dhe workspace-in e vet. Freelancer: menaxhon punën e vet dhe, kur është i autorizuar, biznese klientësh. Ambassador: fokusohet te referimet. White-Label: është për agjenci ose reseller që përdorin markën dhe domain-in e tyre pas konfigurimit komercial. Çdo komision ose përfitim varet nga kushtet dhe konfigurimi aktiv i llogarisë."
      : "Business: manages its own business and workspace. Freelancer: manages independent work and, when authorized, client businesses. Ambassador: focuses on referrals. White-Label: is for agencies or resellers using their own brand and domain after commercial setup. Any commission or benefit depends on the account's active terms and configuration.",
    referralEarnings: isSq
      ? "Referimet e zakonshme dhe komisionet e partnerëve janë mekanizma të ndarë. Çdo pagesë ose komision përdor normën dhe kushtet aktive të llogarisë; Pulse AI nuk premton një përqindje fikse ose komision jetësor publik."
      : "Ordinary referrals and partner commissions are separate mechanisms. Any payout or commission uses the account's active rate and terms; Pulse AI does not promise a fixed public percentage or lifetime commission.",
    afterTrial: isSq
      ? "Pas provës, vazhdimi i aksesit varet nga gjendja aktive e abonimit dhe planit. Metodat e pagesës shfaqen vetëm kur janë realisht të konfiguruara dhe të disponueshme."
      : "After the trial, continued access depends on the active subscription and plan state. Payment methods are shown only when they are actually configured and available.",
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
