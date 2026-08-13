import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrencyForCountry, type SupportedCurrency } from "@/lib/currency";

interface CountryCurrencyState {
  currency: SupportedCurrency;
  countryCode: string | null;
  isExplicitMatch: boolean;   // true = country has a defined routing rule
  isLoading: boolean;
  setCurrency: (c: SupportedCurrency) => void; // allow user override
}

/**
 * Detects the user's country via GeoIP (Supabase geoip-enrich) or
 * browser locale, and returns the appropriate default payment currency.
 *
 * Albania → ALL  |  EU/SEPA → EUR  |  USA/CA → USD  |  Other → EUR (overrideable)
 *
 * The user can always override via setCurrency().
 * Country routing falls back to DB table country_currency_routing for admin overrides.
 */
export const useCountryCurrency = (): CountryCurrencyState => {
  const [currency, setCurrencyState] = useState<SupportedCurrency>("EUR");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [isExplicitMatch, setIsExplicitMatch] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      try {
        // 1. Try DB routing table (admin-managed, most authoritative)
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        // 2. Try GeoIP from Cloudflare/Supabase headers (via geoip-enrich function)
        //    Falls back to browser locale if unavailable.
        let detectedCountry: string | null = null;

        if (token) {
          try {
            const res = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/geoip-enrich`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
                body: JSON.stringify({ detect_only: true }),
              },
            );
            if (res.ok) {
              const geo = await res.json();
              detectedCountry = geo?.country_code ?? geo?.country ?? null;
            }
          } catch {
            // GeoIP unavailable — fall through to locale
          }
        }

        // 3. Fallback: parse browser locale for country hint
        if (!detectedCountry) {
          const locale = navigator.language || navigator.languages?.[0] || "";
          const parts = locale.split(/[-_]/);
          if (parts.length >= 2) {
            detectedCountry = parts[parts.length - 1].toUpperCase();
          }
        }

        if (cancelled) return;

        // 4. Check DB routing table for admin override
        if (detectedCountry) {
          const { data: routing } = await supabase
            .from("country_currency_routing" as any)
            .select("currency")
            .eq("country_code", detectedCountry)
            .maybeSingle();

          if (routing?.currency) {
            setCountryCode(detectedCountry);
            setCurrencyState(routing.currency as SupportedCurrency);
            setIsExplicitMatch(true);
            setIsLoading(false);
            return;
          }
        }

        // 5. Static fallback using getCurrencyForCountry
        const { currency: resolved, explicit } = getCurrencyForCountry(detectedCountry);
        if (!cancelled) {
          setCountryCode(detectedCountry);
          setCurrencyState(resolved);
          setIsExplicitMatch(explicit);
        }
      } catch {
        // All detection failed — default EUR
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    detect();
    return () => { cancelled = true; };
  }, []);

  const setCurrency = (c: SupportedCurrency) => {
    setCurrencyState(c);
  };

  return { currency, countryCode, isExplicitMatch, isLoading, setCurrency };
};
