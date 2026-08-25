import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ArrowLeft, ArrowRight, Home, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { SUPPORTED_LANGUAGES } from "@/i18n";

interface GlobalTopNavProps {
  showNav?: boolean;
}

export const GlobalTopNav = ({ showNav = true }: GlobalTopNavProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { i18n, t } = useTranslation();
  const [isDark, setIsDark] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Detect theme preference
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  // Check if back/forward navigation is available
  useEffect(() => {
    // Simple heuristic: can go back if not on root or login/register
    const isRootPath = location.pathname === "/";
    const isAuthPath = ["/login", "/register", "/forgot-password", "/reset-password"].includes(location.pathname);
    setCanGoBack(!isRootPath && !isAuthPath);

    // Forward is typically not available in modern SPAs
    setCanGoForward(false);
  }, [location.pathname]);

  const handleBack = () => {
    window.history.back();
  };

  const handleForward = () => {
    window.history.forward();
  };

  const handleHome = () => {
    if (user) {
      // Authenticated user: go to dashboard
      navigate("/dashboard");
    } else {
      // Unauthenticated: go to homepage
      navigate("/");
    }
  };

  const toggleTheme = () => {
    const newIsDark = !isDark;
    if (newIsDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
    setIsDark(newIsDark);
  };

  const currentLangCode = i18n.language.split("-")[0];
  const currentLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === currentLangCode)?.code.toUpperCase() || "EN";

  if (!showNav) return null;

  return (
    <nav
      className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40 safe-top"
      role="navigation"
      aria-label="Global navigation"
    >
      <div className="max-w-full px-4 py-2 flex items-center justify-between gap-2 min-h-12">
        {/* Left: Navigation Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={!canGoBack}
            className="w-10 h-10"
            title={t("common.back") || "Back"}
            aria-label={t("common.back") || "Go back"}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleForward}
            disabled={!canGoForward}
            className="w-10 h-10"
            title={t("common.forward") || "Forward"}
            aria-label={t("common.forward") || "Go forward"}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleHome}
            className="w-10 h-10"
            title={t("common.home") || "Home"}
            aria-label={t("common.home") || "Go to home"}
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>

        {/* Center: Current Language Label */}
        <div className="hidden sm:flex items-center justify-center px-2 py-1 rounded bg-muted/50 text-xs font-semibold">
          {currentLangLabel}
        </div>

        {/* Right: Language Switcher + Theme Toggle */}
        <div className="flex items-center gap-1">
          <LanguageSwitcher variant="ghost" />

          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-10 h-10"
            title={isDark ? (t("common.lightMode") || "Light mode") : (t("common.darkMode") || "Dark mode")}
            aria-label={isDark ? (t("common.lightMode") || "Switch to light mode") : (t("common.darkMode") || "Switch to dark mode")}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
};
