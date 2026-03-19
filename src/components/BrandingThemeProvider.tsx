import { useEffect } from "react";
import { useWorkspaceBranding } from "@/hooks/useWorkspaceBranding";

/**
 * Applies workspace branding as CSS custom properties on the document root.
 * Drop this component inside DashboardLayout to dynamically theme the app
 * based on each business's brand settings.
 */
export const BrandingThemeProvider = () => {
  const { branding } = useWorkspaceBranding();

  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;

    // Apply color overrides
    if (branding.primary_color) {
      root.style.setProperty("--primary", branding.primary_color);
    }
    if (branding.primary_foreground) {
      root.style.setProperty("--primary-foreground", branding.primary_foreground);
    }
    if (branding.accent_color) {
      root.style.setProperty("--accent", branding.accent_color);
    }
    if (branding.accent_foreground) {
      root.style.setProperty("--accent-foreground", branding.accent_foreground);
    }

    // Apply gradient as custom properties
    if (branding.brand_gradient_from && branding.brand_gradient_to) {
      root.style.setProperty("--brand-gradient", `linear-gradient(135deg, hsl(${branding.brand_gradient_from}), hsl(${branding.brand_gradient_to}))`);
    }

    // Apply fonts
    if (branding.heading_font && branding.heading_font !== "Inter") {
      loadGoogleFont(branding.heading_font);
      root.style.setProperty("--font-heading", `"${branding.heading_font}", sans-serif`);
    }
    if (branding.body_font && branding.body_font !== "Inter") {
      loadGoogleFont(branding.body_font);
      root.style.setProperty("--font-body", `"${branding.body_font}", sans-serif`);
      root.style.fontFamily = `"${branding.body_font}", sans-serif`;
    }

    // Apply favicon
    if (branding.favicon_url) {
      const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (link) {
        link.href = branding.favicon_url;
      } else {
        const newLink = document.createElement("link");
        newLink.rel = "icon";
        newLink.href = branding.favicon_url;
        document.head.appendChild(newLink);
      }
    }

    // Apply custom CSS
    if (branding.custom_css) {
      let styleEl = document.getElementById("workspace-custom-css");
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = "workspace-custom-css";
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = branding.custom_css;
    }

    // Cleanup on unmount / workspace change
    return () => {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-foreground");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-foreground");
      root.style.removeProperty("--brand-gradient");
      root.style.removeProperty("--font-heading");
      root.style.removeProperty("--font-body");
      root.style.fontFamily = "";
      const customStyle = document.getElementById("workspace-custom-css");
      if (customStyle) customStyle.textContent = "";
    };
  }, [branding]);

  return null; // Render nothing — side-effect only
};

function loadGoogleFont(fontName: string) {
  const id = `gfont-${fontName.replace(/\s/g, "-")}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}
