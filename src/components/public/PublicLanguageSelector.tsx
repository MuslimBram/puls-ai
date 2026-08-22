/**
 * PublicLanguageSelector — language switcher for public (marketing) shell.
 *
 * Supports EN and SQ for Wave 1.
 * Uses the existing i18next infrastructure (pulse-language localStorage key).
 */

import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { usePublicLocale } from "@/hooks/usePublicLocale";

const WAVE1_LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "sq", label: "Shqip",   flag: "🇦🇱" },
] as const;

type LangCode = (typeof WAVE1_LANGUAGES)[number]["code"];

export function PublicLanguageSelector() {
  const { i18n } = useTranslation();
  const { switchLocale } = usePublicLocale();

  const current = WAVE1_LANGUAGES.find((l) => l.code === i18n.language) ?? WAVE1_LANGUAGES[0];

  const switchTo = (code: LangCode) => {
    void i18n.changeLanguage(code);
    switchLocale(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-sm font-medium text-foreground/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Select language"
        >
          <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{current.flag} {current.label}</span>
          <span className="sm:hidden">{current.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {WAVE1_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => switchTo(lang.code)}
            className={lang.code === current.code ? "font-semibold" : ""}
            aria-current={lang.code === current.code ? "true" : undefined}
          >
            <span className="mr-2" aria-hidden="true">{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
