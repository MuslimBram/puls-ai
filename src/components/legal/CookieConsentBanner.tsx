import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "pulse_cookie_consent";

export type CookieConsent = "all" | "essential";

export const getCookieConsent = (): CookieConsent | null => {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "all" || v === "essential" ? v : null;
};

export const setCookieConsent = (value: CookieConsent) => {
  window.localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(new CustomEvent("pulse-cookie-consent", { detail: value }));
};

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (value: CookieConsent) => {
    setCookieConsent(value);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 print:hidden">
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background/95 backdrop-blur shadow-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground flex-1">
          We use cookies for security and to improve the service. You can choose which
          categories to allow.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => choose("all")}>
            Accept all
          </Button>
          <Button size="sm" variant="outline" onClick={() => choose("essential")}>
            Essential only
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/cookies">Learn more</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
