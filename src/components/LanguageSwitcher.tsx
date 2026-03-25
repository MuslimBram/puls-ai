import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { ScrollArea } from "@/components/ui/scroll-area";

export const LanguageSwitcher = ({ variant = "ghost" }: { variant?: "ghost" | "outline" | "default" }) => {
  const { i18n } = useTranslation();
  const [search, setSearch] = useState("");

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ||
    SUPPORTED_LANGUAGES.find((l) => i18n.language.startsWith(l.code)) ||
    SUPPORTED_LANGUAGES[0];

  const filtered = SUPPORTED_LANGUAGES.filter((l) =>
    l.label.toLowerCase().includes(search.toLowerCase()) ||
    l.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className="gap-1.5">
          <span className="text-base leading-none">{currentLang.flag}</span>
          <Globe className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <Input
            placeholder="Search language..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <ScrollArea className="h-64">
          {filtered.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => {
                i18n.changeLanguage(lang.code);
                setSearch("");
              }}
              className={i18n.language === lang.code || i18n.language.startsWith(lang.code) ? "bg-accent/50 font-medium" : ""}
            >
              <span className="mr-2 text-base">{lang.flag}</span>
              <span className="text-sm">{lang.label}</span>
              {(i18n.language === lang.code || i18n.language.startsWith(lang.code)) && (
                <span className="ml-auto text-xs text-primary">✓</span>
              )}
            </DropdownMenuItem>
          ))}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
