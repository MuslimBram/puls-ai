/**
 * PublicMobileNav — slide-in mobile navigation for the public website.
 *
 * Opens as a sheet from the left.
 * Shows all nav groups with expandable platform section.
 * Closes on link tap.
 */

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  megaNavGroups,
  standaloneNavItems,
  type NavItem,
} from "./publicNavConfig";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export function PublicMobileNav() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();

  return (
    <>
      {/* Hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden h-9 w-9"
        aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
        aria-expanded={open}
        aria-controls="public-mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </Button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        id="public-mobile-nav"
        aria-label={t("nav.mobileMenu")}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border shadow-xl",
          "flex flex-col overflow-y-auto transition-transform duration-300 ease-in-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Drawer header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-base font-bold tracking-tight text-foreground">
            Pulse <span className="text-primary">AI</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("nav.closeMenu")}
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Nav content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Mega nav groups */}
          {megaNavGroups.map((group) => (
            <MobileNavGroup
              key={group.groupLabelKey}
              groupLabel={t(group.groupLabelKey)}
              items={group.items}
              onClose={() => setOpen(false)}
              localizeHref={localizedPath}
            />
          ))}

          {/* Standalone items */}
          <div className="px-4 pt-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("nav.group.more")}
            </p>
            {standaloneNavItems.map((item) => (
              <MobileNavLink
                key={item.href}
                item={item}
                onClose={() => setOpen(false)}
                href={localizedPath(item.href)}
              />
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}

function MobileNavGroup({
  groupLabel,
  items,
  onClose,
}: {
  groupLabel: string;
  items: NavItem[];
  onClose: () => void;
  localizeHref: (href: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between py-2",
          "text-xs font-semibold uppercase tracking-widest text-muted-foreground",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm",
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {groupLabel}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <ul className="mb-2 space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              <MobileNavLink item={item} onClose={onClose} href={localizeHref(item.href)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MobileNavLink({
  item,
  onClose,
  href,
}: {
  item: NavItem;
  onClose: () => void;
  href: string;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isActive = pathname === href;

  if (item.comingSoon) {
    return (
      <div
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground cursor-default"
        aria-disabled="true"
      >
        {t(item.labelKey)}
        <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
          {t("badge.comingSoon")}
        </Badge>
      </div>
    );
  }

  return (
    <Link
      to={href}
      onClick={onClose}
      className={cn(
        "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-foreground/80",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      {t(item.labelKey)}
    </Link>
  );
}
