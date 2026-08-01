import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LegalLayout, Section, type LegalSection } from "@/components/legal/LegalLayout";
import { getCookieConsent, setCookieConsent } from "@/components/legal/CookieConsentBanner";

const sections: LegalSection[] = [
  { id: "what", title: "1. What cookies are" },
  { id: "types", title: "2. Cookies we use" },
  { id: "preferences", title: "3. Your preferences" },
  { id: "managing", title: "4. Managing cookies in your browser" },
];

const rows = [
  ["Essential", "Session, authentication, CSRF protection, load balancing", "Session – 24 hours", "Always on"],
  ["Preferences", "Language, theme, cookie choice, dismissed banners", "Up to 12 months", "Optional"],
  ["Analytics", "Aggregated feature usage and error diagnostics", "Up to 12 months", "Optional"],
  ["Marketing", "Attribution for referral and ambassador links", "Up to 90 days", "Optional"],
];

export default function CookiePolicy() {
  const [optional, setOptional] = useState(false);

  useEffect(() => {
    setOptional(getCookieConsent() === "all");
  }, []);

  const save = () => {
    setCookieConsent(optional ? "all" : "essential");
    toast.success("Cookie preferences saved");
  };

  return (
    <LegalLayout
      title="Cookie Policy"
      subtitle="Which cookies Pulse AI sets, why they exist, how long they last and how to change your choice."
      description="Pulse AI Cookie Policy: essential, preference, analytics and marketing cookies, their retention periods, and how to manage your consent."
      path="/cookies"
      sections={sections}
    >
      <Section id="what" title="1. What cookies are">
        <p>
          Cookies are small files stored by your browser. We also use equivalent technologies such as
          localStorage. Some are required for the platform to function; others are optional and only
          set after you allow them.
        </p>
      </Section>

      <Section id="types" title="2. Cookies we use">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-foreground">
                <th className="text-left py-2 pr-4 font-medium">Category</th>
                <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                <th className="text-left py-2 pr-4 font-medium">Retention</th>
                <th className="text-left py-2 font-medium">Consent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([cat, purpose, retention, consent]) => (
                <tr key={cat} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-4 text-foreground font-medium">{cat}</td>
                  <td className="py-2 pr-4">{purpose}</td>
                  <td className="py-2 pr-4">{retention}</td>
                  <td className="py-2">{consent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="preferences" title="3. Your preferences">
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-foreground">Essential cookies</div>
              <p className="text-sm text-muted-foreground">
                Required for sign-in and security. Cannot be disabled.
              </p>
            </div>
            <Switch checked disabled aria-label="Essential cookies always enabled" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-foreground">Analytics, preferences and marketing</div>
              <p className="text-sm text-muted-foreground">
                Helps us improve the product and attribute referral links.
              </p>
            </div>
            <Switch
              checked={optional}
              onCheckedChange={setOptional}
              aria-label="Optional cookies"
            />
          </div>
          <Button size="sm" onClick={save}>
            Save preferences
          </Button>
        </div>
      </Section>

      <Section id="managing" title="4. Managing cookies in your browser">
        <p>
          You can delete or block cookies in your browser settings. Blocking essential cookies will
          prevent you from signing in. Clearing site data resets your consent choice and the banner
          will appear again.
        </p>
      </Section>
    </LegalLayout>
  );
}
