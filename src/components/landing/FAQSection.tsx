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
  const { t } = useTranslation();

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
                {t(`landing.faq.items.${key}.a`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};
