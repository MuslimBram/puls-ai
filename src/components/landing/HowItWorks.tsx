import { UserPlus, FileText, Link2, Bot } from "lucide-react";
import { useTranslation } from "react-i18next";

const steps = [
  { icon: UserPlus, key: "register" },
  { icon: FileText, key: "profile" },
  { icon: Link2, key: "channels" },
  { icon: Bot, key: "aiWorks" },
];

export const HowItWorks = () => {
  const { t, i18n } = useTranslation();
  const isSq = i18n.resolvedLanguage?.toLowerCase().startsWith("sq") ?? false;

  const registerDescription = isSq
    ? "Krijo llogarinë dhe zgjidh Business, Freelancer, Ambassador ose White-Label."
    : "Create your account and choose Business, Freelancer, Ambassador or White-Label.";

  return (
    <section className="container mx-auto px-4 py-16">
      <div className="mb-12 text-center animate-on-scroll">
        <h2 className="mb-2 text-3xl font-bold text-foreground">
          {t("landing.howItWorks.title")}
        </h2>
        <p className="mx-auto max-w-lg text-muted-foreground">
          {t("landing.howItWorks.desc")}
        </p>
      </div>
      <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-4 stagger-children">
        {steps.map((step, i) => (
          <div key={step.key} className="relative flex flex-col items-center text-center animate-on-scroll">
            {i < steps.length - 1 && (
              <div className="absolute left-[calc(50%+2rem)] top-8 hidden h-0.5 w-[calc(100%-4rem)] bg-gradient-to-r from-primary/40 to-primary/10 md:block" />
            )}
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/5">
              <step.icon className="h-7 w-7" />
            </div>
            <span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {i + 1}
            </span>
            <h3 className="mb-1 font-semibold text-foreground">
              {t(`landing.howItWorks.steps.${step.key}.title`)}
            </h3>
            <p className="text-sm text-muted-foreground">
              {step.key === "register"
                ? registerDescription
                : t(`landing.howItWorks.steps.${step.key}.desc`)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
