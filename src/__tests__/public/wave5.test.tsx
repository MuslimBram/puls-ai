import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import PublicLocaleLayout from "@/components/public/PublicLocaleLayout";
import Index from "@/pages/Index";
import PlatformAi from "@/pages/platform/PlatformAi";
import i18n from "@/i18n";
import { usePublicLocale } from "@/hooks/usePublicLocale";
import {
  LOCALIZABLE_PUBLIC_PATHS,
  buildPublicHreflangLinks,
  localizePublicPath,
  stripPublicLocale,
} from "@/lib/publicLocale";
import { allPublicNavItems } from "@/components/public/publicNavConfig";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    session: null,
    user: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {},
    functions: {
      invoke: vi.fn(),
    },
  },
}));

function LocationEcho() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function SwitchLocaleButton() {
  const { switchLocale } = usePublicLocale();
  return <button onClick={() => switchLocale("sq")}>Switch locale</button>;
}

function renderLocalizedRoute(initialEntry: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/:locale" element={<PublicLocaleLayout />}>
            <Route index element={<><LocationEcho /><Index /></>} />
            <Route path="platform/ai" element={<><LocationEcho /><SwitchLocaleButton /><PlatformAi /></>} />
            <Route path="pricing" element={<><LocationEcho /><div>pricing</div></>} />
            <Route path="*" element={<LocationEcho />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe("Wave 5 localized public routing", () => {
  beforeEach(async () => {
    cleanup();
    localStorage.clear();
    document.head.innerHTML = "";
    document.documentElement.lang = "en";
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("/en routes resolve independently", async () => {
    renderLocalizedRoute("/en");

    expect(
      await screen.findByRole("heading", { name: "The AI Business Operating System" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/en");
  });

  it("/sq routes resolve independently", async () => {
    renderLocalizedRoute("/sq");

    expect(
      await screen.findByRole("heading", { name: "Sistemi Operativ i Biznesit me AI" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The AI Business Operating System" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("/sq");
  });

  it("locale persists from the localized route", async () => {
    renderLocalizedRoute("/sq/platform/ai");

    await waitFor(() => {
      expect(localStorage.getItem("pulse-language")).toBe("sq");
      expect(document.documentElement.lang).toBe("sq");
    });
  });

  it("language switching preserves the current public destination", async () => {
    renderLocalizedRoute("/en/platform/ai");

    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/sq/platform/ai");
    });
  });

  it("localized public links do not fall back to unprefixed routes", async () => {
    renderLocalizedRoute("/sq");

    const pricingLink = await screen.findByRole("link", { name: "Shko te Çmimet" });
    expect(pricingLink).toHaveAttribute("href", "/sq/pricing");
  });

  it("hreflang tags are emitted for EN/SQ public routes", async () => {
    renderLocalizedRoute("/sq");

    await waitFor(() => {
      const enLink = document.head.querySelector('link[rel="alternate"][hreflang="en"]');
      const sqLink = document.head.querySelector('link[rel="alternate"][hreflang="sq"]');
      const defaultLink = document.head.querySelector('link[rel="alternate"][hreflang="x-default"]');

      expect(enLink).not.toBeNull();
      expect(sqLink).not.toBeNull();
      expect(defaultLink).not.toBeNull();
      expect(enLink).toHaveAttribute("href", "https://pulse-bos.com/en");
      expect(sqLink).toHaveAttribute("href", "https://pulse-bos.com/sq");
      expect(defaultLink).toHaveAttribute("href", "https://pulse-bos.com/en");
    });
  });

  it("unsupported locale-like public paths fall back safely", async () => {
    renderLocalizedRoute("/de/platform/ai");

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/en/platform/ai");
    });
  });
});

describe("Wave 5 localization helpers", () => {
  it("preserves public path parity for all localizable routes", () => {
    LOCALIZABLE_PUBLIC_PATHS.forEach((path) => {
      expect(stripPublicLocale(localizePublicPath(path, "en"))).toBe(path);
      expect(stripPublicLocale(localizePublicPath(path, "sq"))).toBe(path);
    });
  });

  it("localizes all public nav links for SQ", () => {
    allPublicNavItems.forEach((item) => {
      expect(localizePublicPath(item.href, "sq")).toMatch(/^\/sq(?:\/|$)/);
    });
  });

  it("builds EN/SQ/x-default hreflang triplets", () => {
    expect(buildPublicHreflangLinks("/platform/ai", "https://pulse-bos.com")).toEqual([
      { hrefLang: "en", href: "https://pulse-bos.com/en/platform/ai" },
      { hrefLang: "sq", href: "https://pulse-bos.com/sq/platform/ai" },
      { hrefLang: "x-default", href: "https://pulse-bos.com/en/platform/ai" },
    ]);
  });
});
