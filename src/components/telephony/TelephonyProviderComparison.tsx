import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { capabilitiesOf, TELEPHONY_PROVIDERS, type PriceSource } from "@/config/telephonyProviders";
import type { ProviderId } from "../../../supabase/functions/_shared/telephony/providers";

const USD_TO_ALL = 80; // same indicative rate used on the pricing pages

const sourceLabel = (s: PriceSource, sq: boolean) =>
  s === "official" ? (sq ? "zyrtar" : "official") : s === "third_party" ? (sq ? "palë e tretë" : "third party") : (sq ? "s'publikohet" : "not published");

const unitLabel = (u: string, sq: boolean) => (u === "min" ? "/min" : u === "month" ? (sq ? "/muaj" : "/month") : "/SMS");

/**
 * Side-by-side prices and strengths, so the business (or a Pulse AI admin
 * configuring on its behalf) chooses the provider that suits it and knows why.
 */
export const TelephonyProviderComparison = ({
  selected,
  onSelect,
}: {
  selected?: string;
  onSelect?: (id: ProviderId) => void;
}) => {
  const { i18n } = useTranslation();
  const sq = i18n.resolvedLanguage?.toLowerCase().startsWith("sq") ?? false;
  const lang = sq ? "sq" : "en";

  return (
    <Card data-testid="telephony-provider-comparison">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{sq ? "Krahasoni ofruesit e telefonisë" : "Compare telephony providers"}</CardTitle>
        <CardDescription>
          {sq
            ? "Çmime publike orientuese (USD, nëntor 2026; 1 $ ≈ 80 lekë). Çmimi real varet nga llogaria juaj — kontrollojeni te faqja e ofruesit."
            : "Indicative public prices (USD, November 2026; $1 ≈ 80 ALL). Your real price depends on your account — check the provider's page."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TELEPHONY_PROVIDERS.map((p) => {
          const caps = capabilitiesOf(p.id);
          const active = selected === p.id;
          return (
            <div key={p.id} className={cn("flex flex-col rounded-lg border p-3 text-sm", active ? "border-primary ring-1 ring-primary" : "border-border")}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{p.label}</p>
                {caps.albanianTts === "native" && <Badge variant="secondary">{sq ? "Flet shqip" : "Speaks Albanian"}</Badge>}
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{p.bestFor[lang]}</p>
              <ul className="mb-2 space-y-0.5 text-xs">
                {p.prices.map((line) => (
                  <li key={line.label.en} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{line.label[lang]}</span>
                    <span className="whitespace-nowrap font-medium text-foreground">
                      {line.usd === null ? "—" : `$${line.usd}${unitLabel(line.unit, sq)} ≈ ${(line.usd * USD_TO_ALL).toFixed(line.usd * USD_TO_ALL < 10 ? 2 : 0)} L`}
                      <span className="ml-1 font-normal text-muted-foreground">({sourceLabel(line.source, sq)})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mb-2 flex flex-wrap gap-1">
                {caps.browserSoftphone && <Badge variant="outline">{sq ? "Softphone në shfletues" : "Browser softphone"}</Badge>}
                {caps.aiVoiceAgent && <Badge variant="outline">{sq ? "AI me zë" : "AI voice"}</Badge>}
                {caps.inboundIvr && <Badge variant="outline">IVR</Badge>}
                {caps.recording && <Badge variant="outline">{sq ? "Regjistrim" : "Recording"}</Badge>}
              </div>
              <p className="text-xs text-foreground">+ {p.pros[lang].join(" · ")}</p>
              <p className="mb-2 text-xs text-muted-foreground">− {p.cons[lang].join(" · ")}</p>
              <div className="mt-auto flex items-center gap-2">
                {onSelect && (
                  <Button size="sm" variant={active ? "default" : "outline"} onClick={() => onSelect(p.id)}>
                    {active ? (sq ? "E zgjedhur" : "Selected") : (sq ? "Zgjidh" : "Choose")}
                  </Button>
                )}
                {p.pricingUrl && (
                  <a href={p.pricingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
                    {sq ? "Çmimet zyrtare" : "Official prices"}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
