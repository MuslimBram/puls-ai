/**
 * publicNavConfig — canonical public navigation structure for Pulse AI
 *
 * Platform routes = /platform/:slug
 * Standalone routes = top-level /slug
 * Business routes = top-level /slug
 * Company routes = top-level /slug
 *
 * DO NOT include admin-only or internal authenticated routes.
 * DO NOT include the 23 held-back authenticated routes.
 * Canonical Developers route = /platform/developers
 */

export interface NavItem {
  labelKey: string;   // i18n key
  href: string;
  /** If true, renders a Coming Soon badge and disables navigation */
  comingSoon?: boolean;
  /** If true, renders a Beta badge */
  beta?: boolean;
}

export interface NavGroup {
  groupLabelKey: string;
  items: NavItem[];
}

/** Platform mega-nav items */
export const platformNavItems: NavItem[] = [
  { labelKey: "nav.platform.aiIntelligence", href: "/platform/ai" },
  { labelKey: "nav.platform.unifiedInbox",   href: "/platform/unified-inbox" },
  { labelKey: "nav.platform.crmSales",       href: "/platform/crm" },
  { labelKey: "nav.platform.marketing",      href: "/platform/marketing" },
  { labelKey: "nav.platform.automation",     href: "/platform/automation" },
  { labelKey: "nav.platform.analytics",      href: "/platform/analytics" },
  { labelKey: "nav.platform.developers",     href: "/platform/developers", comingSoon: true },
];

/** Standalone top-level nav items */
export const standaloneNavItems: NavItem[] = [
  { labelKey: "nav.standalone.lidhjet", href: "/platform/lidhjet", comingSoon: true },
  { labelKey: "nav.standalone.pricing", href: "/pricing" },
  { labelKey: "nav.standalone.security", href: "/security" },
];

/** Business nav items */
export const businessNavItems: NavItem[] = [
  { labelKey: "nav.business.partners",    href: "/platform/partners",  comingSoon: true },
  { labelKey: "nav.business.whiteLabel",  href: "/white-label" },
];

/** Company nav items */
export const companyNavItems: NavItem[] = [
  { labelKey: "nav.company.about",    href: "/about",   comingSoon: true },
  { labelKey: "nav.company.contact",  href: "/contact", comingSoon: true },
];

/** Growth Suite hub — held back, Coming Soon only */
export const growthSuiteNavItems: NavItem[] = [
  { labelKey: "nav.growthSuite.label", href: "/growth-suite", comingSoon: true },
];

/** All mega-nav groups for desktop navigation */
export const megaNavGroups: NavGroup[] = [
  {
    groupLabelKey: "nav.group.platform",
    items: platformNavItems,
  },
  {
    groupLabelKey: "nav.group.business",
    items: businessNavItems,
  },
  {
    groupLabelKey: "nav.group.company",
    items: companyNavItems,
  },
];

/** Flat list of all public nav items (for mobile/footer/sitemap) */
export const allPublicNavItems: NavItem[] = [
  ...platformNavItems,
  ...standaloneNavItems,
  ...businessNavItems,
  ...companyNavItems,
];
