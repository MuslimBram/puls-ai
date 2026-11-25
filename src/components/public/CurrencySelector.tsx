import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DISPLAY_CURRENCIES, useDisplayCurrency } from "@/hooks/useDisplayCurrency";

/** Zgjedhja e monedhës për vizitorin (Lek / Euro / Dollar). */
export function CurrencySelector({ className = "" }: { className?: string }) {
  const { currency, setCurrency } = useDisplayCurrency();
  const { i18n } = useTranslation();
  const sq = i18n.language?.startsWith("sq");
  const cur = DISPLAY_CURRENCIES.find((c) => c.code === currency) ?? DISPLAY_CURRENCIES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={"h-8 gap-1.5 px-2 text-sm font-medium text-foreground/70 hover:text-foreground " + className}
          aria-label={sq ? "Zgjidh monedhën" : "Select currency"}
        >
          <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{cur.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {DISPLAY_CURRENCIES.map((c) => (
          <DropdownMenuItem
            key={c.code}
            onClick={() => setCurrency(c.code)}
            className={c.code === currency ? "font-semibold" : ""}
            aria-current={c.code === currency ? "true" : undefined}
          >
            <span className="mr-2" aria-hidden="true">{c.flag}</span>
            {c.code} · {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
