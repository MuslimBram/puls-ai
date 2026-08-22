import { Lock, Shield, Server, KeyRound, Eye, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LegalLayout, Section, InfoCard, type LegalSection } from "@/components/legal/LegalLayout";

export default function SecurityOverview() {
  const { t } = useTranslation();

  const sections: LegalSection[] = [
    { id: "pillars",         title: `1. ${t("securityPage.pillars.heading")}` },
    { id: "encryption",      title: `2. ${t("securityPage.sections.encryptionTitle")}` },
    { id: "access",          title: `3. ${t("securityPage.sections.accessTitle")}` },
    { id: "hosting",         title: `4. ${t("securityPage.sections.hostingTitle")}` },
    { id: "monitoring",      title: `5. ${t("securityPage.sections.monitoringTitle")}` },
    { id: "responsibility",  title: `6. ${t("securityPage.sections.sharedTitle")}` },
    { id: "report",          title: `7. ${t("securityPage.sections.reportTitle")}` },
  ];
  const pillars = [
    { icon: Lock, title: t("securityPage.pillars.encryption.title"), body: t("securityPage.pillars.encryption.body") },
    { icon: Shield, title: t("securityPage.pillars.rls.title"), body: t("securityPage.pillars.rls.body") },
    { icon: KeyRound, title: t("securityPage.pillars.auth.title"), body: t("securityPage.pillars.auth.body") },
    { icon: Server, title: t("securityPage.pillars.hosting.title"), body: t("securityPage.pillars.hosting.body") },
    { icon: Eye, title: t("securityPage.pillars.audit.title"), body: t("securityPage.pillars.audit.body") },
    { icon: AlertTriangle, title: t("securityPage.pillars.webhook.title"), body: t("securityPage.pillars.webhook.body") },
  ];

  return (
    <LegalLayout
      title={t("securityPage.hero.title")}
      subtitle={t("securityPage.hero.subtitle")}
      description={t("securityPage.seo.desc")}
      path="/security"
      sections={sections}
    >
      <Section id="pillars" title={`1. ${t("securityPage.pillars.heading")}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border p-5">
              <Icon className="h-5 w-5 text-primary mb-3" />
              <div className="font-medium text-foreground mb-1">{title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="encryption" title={`2. ${t("securityPage.sections.encryptionTitle")}`}>
        <p>
          {t("securityPage.sections.encryptionBody")}
        </p>
      </Section>

      <Section id="access" title={`3. ${t("securityPage.sections.accessTitle")}`}>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("securityPage.sections.accessItems.rbac")}</li>
          <li>{t("securityPage.sections.accessItems.server")}</li>
          <li>{t("securityPage.sections.accessItems.totp")}</li>
          <li>{t("securityPage.sections.accessItems.device")}</li>
          <li>{t("securityPage.sections.accessItems.session")}</li>
        </ul>
      </Section>

      <Section id="hosting" title={`4. ${t("securityPage.sections.hostingTitle")}`}>
        <p>
          {t("securityPage.sections.hostingBody")}
        </p>
      </Section>

      <Section id="monitoring" title={`5. ${t("securityPage.sections.monitoringTitle")}`}>
        <p>
          {t("securityPage.sections.monitoringBody")}
        </p>
      </Section>

      <Section id="responsibility" title={`6. ${t("securityPage.sections.sharedTitle")}`}>
        <InfoCard title={t("common.weDo", { defaultValue: "What we do" })}>
          {t("securityPage.sections.sharedWeDo")}
        </InfoCard>
        <InfoCard title={t("common.youDo", { defaultValue: "What you do" })}>
          {t("securityPage.sections.sharedYouDo")}
        </InfoCard>
        <p>{t("securityPage.sections.sharedDisclaimer")}</p>
      </Section>

      <Section id="report" title={`7. ${t("securityPage.sections.reportTitle")}`}>
        <p>{t("securityPage.sections.reportBody")}</p>
      </Section>
    </LegalLayout>
  );
}
