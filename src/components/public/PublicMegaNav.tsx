/**
 * PublicMegaNav — desktop mega-navigation for the public Pulse AI website.
 *
 * Renders platform items in a dropdown panel, plus standalone top-level links.
 * Uses Radix NavigationMenu via shadcn/ui.
 * Keyboard accessible (arrow keys, Escape to close).
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  megaNavGroups,
  standaloneNavItems,
  type NavItem,
} from "./publicNavConfig";

export function PublicMegaNav() {
  const { t } = useTranslation();

  return (
    <NavigationMenu className="hidden lg:flex">
      <NavigationMenuList>
        {/* Platform dropdown */}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 text-sm font-medium">
            {t("nav.group.platform")}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-[520px] gap-0 p-4 lg:grid-cols-2">
              {megaNavGroups.map((group) => (
                <div key={group.groupLabelKey} className="space-y-1">
                  <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {t(group.groupLabelKey)}
                  </p>
                  {group.items.map((item) => (
                    <MegaNavItem key={item.href} item={item} />
                  ))}
                </div>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {/* Standalone nav items */}
        {standaloneNavItems.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              className={cn(navigationMenuTriggerStyle(), "h-9 text-sm font-medium")}
              asChild
            >
              <Link to={item.href}>
                {t(item.labelKey)}
                {item.comingSoon && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                    {t("badge.comingSoon")}
                  </Badge>
                )}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function MegaNavItem({ item }: { item: NavItem }) {
  const { t } = useTranslation();

  const content = (
    <span className="flex items-center gap-2 text-sm">
      {t(item.labelKey)}
      {item.comingSoon && (
        <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
          {t("badge.comingSoon")}
        </Badge>
      )}
    </span>
  );

  if (item.comingSoon) {
    return (
      <div
        className="block select-none rounded-md px-3 py-2 leading-none text-muted-foreground cursor-default"
        aria-disabled="true"
      >
        {content}
      </div>
    );
  }

  return (
    <NavigationMenuLink asChild>
      <Link
        to={item.href}
        className={cn(
          "block select-none rounded-md px-3 py-2 leading-none no-underline outline-none",
          "text-sm text-foreground/80 transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        {content}
      </Link>
    </NavigationMenuLink>
  );
}
