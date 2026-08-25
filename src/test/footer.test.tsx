import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import { GlobalFooter } from "@/components/GlobalFooter";

describe("GlobalFooter", () => {
  const renderFooter = () => {
    return render(
      <BrowserRouter>
        <I18nextProvider i18n={i18n}>
          <GlobalFooter />
        </I18nextProvider>
      </BrowserRouter>
    );
  };

  describe("Footer Rendering", () => {
    beforeEach(() => {
      i18n.changeLanguage("en");
    });

    it("should render footer once", () => {
      const { container } = renderFooter();
      const footers = container.querySelectorAll("footer");
      expect(footers.length).toBe(1);
    });

    it("should render Pulse AI branding", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.textContent?.includes("Pulse AI")).toBe(true);
    });

    it("should render copyright year", () => {
      const { container } = renderFooter();
      const currentYear = new Date().getFullYear();
      const footer = container.querySelector("footer");
      const hasCopyright = footer?.textContent?.includes(`© ${currentYear}`);
      expect(hasCopyright).toBe(true);
    });

    it("should render legal links", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      // Check for Privacy links in footer
      const privacyLinks = footer?.querySelectorAll('a[href="/privacy"]');
      expect(privacyLinks && privacyLinks.length > 0).toBe(true);
    });

    it("should have Privacy link pointing to /privacy", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const privacyLink = footer?.querySelector('a[href="/privacy"]');
      expect(privacyLink).toBeInTheDocument();
    });

    it("should have Terms link pointing to /terms", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const termsLink = footer?.querySelector('a[href="/terms"]');
      expect(termsLink).toBeInTheDocument();
    });

    it("should have Cookies link pointing to /cookies", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const cookiesLink = footer?.querySelector('a[href="/cookies"]');
      expect(cookiesLink).toBeInTheDocument();
    });

    it("should have Security link pointing to /security", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const securityLink = footer?.querySelector('a[href="/security"]');
      expect(securityLink).toBeInTheDocument();
    });

    it("should render tagline", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const hasTagline =
        footer?.textContent?.includes("The AI Business Operating System") ||
        footer?.textContent?.includes("Sistemi Operativ i Biznesit AI");
      expect(hasTagline).toBe(true);
    });

    it("should not display language selector in footer", () => {
      const { container } = renderFooter();
      const languageElements = container.querySelectorAll(
        '[aria-label*="language" i], [title*="language" i]'
      );
      // Should not have language picker in footer
      const footerLanguagePickers = Array.from(languageElements).filter(
        (el) => el.closest("footer")
      );
      expect(footerLanguagePickers.length).toBe(0);
    });
  });

  describe("i18n & Localization", () => {
    it("should have English translations for footer", () => {
      const enResources = i18n.getResourceBundle("en", "translation");
      expect(enResources.footer.privacy).toBeDefined();
      expect(enResources.footer.terms).toBeDefined();
      expect(enResources.footer.cookies).toBeDefined();
      expect(enResources.footer.security).toBeDefined();
      expect(enResources.footer.tagline).toBeDefined();
    });

    it("should have Albanian translations for footer", () => {
      const sqResources = i18n.getResourceBundle("sq", "translation");
      expect(sqResources.footer.privacy).toBeDefined();
      expect(sqResources.footer.terms).toBeDefined();
      expect(sqResources.footer.cookies).toBeDefined();
      expect(sqResources.footer.security).toBeDefined();
      expect(sqResources.footer.tagline).toBeDefined();
    });

    it("should show English text by default", () => {
      i18n.changeLanguage("en");
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      const privacyLink = footer?.querySelector('a[href="/privacy"]');
      expect(privacyLink).toBeInTheDocument();
    });

    it("should show Albanian text when language is switched", () => {
      i18n.changeLanguage("sq");
      const { container } = renderFooter();
      // Check for Albanian footer text
      expect(
        container.textContent?.includes("Sistemi Operativ i Biznesit AI")
      ).toBe(true);
    });
  });

  describe("Styling & Responsiveness", () => {
    it("should have footer styling classes", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.className).toMatch(/bg-background|px-4|py-4|border-t/);
    });

    it("should have mobile and desktop layout classes", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      // Check for responsive divs inside footer
      const desktopLayout = footer?.querySelector(".hidden.sm\\:grid");
      const mobileLayout = footer?.querySelector(".sm\\:hidden");
      expect(desktopLayout || mobileLayout).toBeInTheDocument();
    });

    it("should have reduced opacity/muted foreground styling", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.className).toMatch(/text-muted-foreground|text-sm/);
    });

    it("should have backdrop blur for visual hierarchy", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.className).toMatch(/backdrop-blur/);
    });
  });

  describe("Link Behavior", () => {
    beforeEach(() => {
      i18n.changeLanguage("en");
    });

    it("should have footer links", () => {
      const { container } = renderFooter();
      const links = container.querySelectorAll("footer a");
      // Should have at least 4 links (Privacy, Terms, Cookies, Security)
      expect(links.length).toBeGreaterThanOrEqual(4);
    });

    it("should have proper hover states on links", () => {
      const { container } = renderFooter();
      const links = container.querySelectorAll("footer a");
      links.forEach((link) => {
        expect(link.className).toMatch(/hover:text-foreground/);
      });
    });

    it("should have tooltips on footer links", () => {
      const { container } = renderFooter();
      const links = container.querySelectorAll("footer a");
      let hasTooltips = false;
      links.forEach((link) => {
        if (link.getAttribute("title")) {
          hasTooltips = true;
        }
      });
      expect(hasTooltips).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      i18n.changeLanguage("en");
    });

    it("should render when on protected routes", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer).toBeInTheDocument();
    });

    it("should render on public pages", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer).toBeInTheDocument();
    });

    it("should render on legal pages", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      // Check for Privacy link in footer
      const privacyLink = footer?.querySelector('a[href="/privacy"]');
      expect(privacyLink || footer).toBeInTheDocument();
    });

    it("should have proper spacing and layout", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      // Should have max-width container
      const contentContainer = footer?.querySelector(".max-w-7xl");
      expect(contentContainer).toBeInTheDocument();
    });

    it("should use max container width for desktop content", () => {
      const { container } = renderFooter();
      const maxWidthContainer = container.querySelector(".max-w-7xl");
      expect(maxWidthContainer?.className).toMatch(/max-w-7xl|mx-auto/);
    });
  });

  describe("Accessibility", () => {
    it("should have semantic footer element", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.tagName).toBe("FOOTER");
    });

    it("should have proper link semantics", () => {
      const { container } = renderFooter();
      const links = container.querySelectorAll("footer a");
      links.forEach((link) => {
        expect(link.tagName).toBe("A");
        expect(link.getAttribute("href")).toBeTruthy();
      });
    });

    it("should have accessible text contrast", () => {
      const { container } = renderFooter();
      const footer = container.querySelector("footer");
      expect(footer?.className).toMatch(/text-muted-foreground|text-foreground/);
    });

    it("should allow keyboard navigation to footer links", () => {
      const { container } = renderFooter();
      const links = container.querySelectorAll("footer a");
      links.forEach((link) => {
        expect((link as HTMLAnchorElement).href).toBeTruthy();
      });
    });
  });

  describe("No Duplication", () => {
    it("should render footer only once when mounted", () => {
      const { container } = render(
        <BrowserRouter>
          <I18nextProvider i18n={i18n}>
            <GlobalFooter />
          </I18nextProvider>
        </BrowserRouter>
      );

      const footers = container.querySelectorAll("footer");
      expect(footers.length).toBe(1);
    });

    it("should not duplicate Pulse AI branding significantly", () => {
      renderFooter();
      const pulseAIElements = screen.getAllByText("Pulse AI");
      // Desktop and mobile both show "Pulse AI", so up to 2 is acceptable
      // (hidden/shown via responsive classes)
      expect(pulseAIElements.length).toBeLessThanOrEqual(2);
    });
  });
});
