/**
 * PlatformInbox — /platform/unified-inbox
 *
 * Public marketing page for Pulse AI's Unified Inbox module.
 * Reuses PublicShell. No authenticated components.
 */

import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { PublicShell } from "@/components/public/PublicShell";
import { PublicCTA } from "@/components/public/PublicCTA";
import { Seo } from "@/components/Seo";

const CHANNELS = [
  "WhatsApp",
  "Instagram",
  "Facebook / Messenger",
  "Telegram",
  "SMS",
  "Email",
  "Voice",
  "Web Chat",
];

export default function PlatformInbox() {
  const { t } = useTranslation();

  return (
    <PublicShell>
      <Seo
        title={t("platformInbox.seo.title")}
        description={t("platformInbox.seo.desc")}
      />

      <section className="py-20 px-4 text-center">
        <div className="mx-auto max-w-3xl">
          <Badge className="mb-4">{t("platform.status.live")}</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t("platformInbox.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("platformInbox.hero.desc")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/inbox" />
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 text-2xl font-semibold">
            {t("platformInbox.channels.heading")}
          </h2>
          <ul className="flex flex-wrap justify-center gap-3" aria-label={t("platformInbox.channels.heading")}>
            {CHANNELS.map((ch) => (
              <li key={ch}>
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {ch}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 px-4 text-center bg-muted/40">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-semibold">{t("platformInbox.cta.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("platformInbox.cta.desc")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PublicCTA priority="primary" size="lg" appDestination="/inbox" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
