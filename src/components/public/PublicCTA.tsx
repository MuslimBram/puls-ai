/**
 * PublicCTA — auth-aware call-to-action components for the public website.
 *
 * Variants:
 *   DEFAULT    — Logged out → Login/Register with safe return destination (next param)
 *              — Logged in  → Go to Dashboard
 *   BETA       — Request Beta Access (interest-capture foundation, Phase 2E backend TBD)
 *   COMING_SOON — Notify Me (interest-capture foundation, Phase 2E backend TBD)
 *
 * BETA and COMING_SOON do NOT create accounts — they are interest-capture stubs only.
 * Phase 2E will wire these to a real backend interest-capture workflow.
 *
 * Preserves safeNavigate / validateInternalPath security protections.
 * Never navigates to an unvalidated external URL.
 */

import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { validateInternalPath } from "@/lib/safeNavigate";
import { cn } from "@/lib/utils";
import { ArrowRight, Bell, Loader2 } from "lucide-react";
import { buildLoggedOutCtaLoginHref } from "./publicCtaDestination";
import { usePublicLocale } from "@/hooks/usePublicLocale";

export type CTAVariant = "default" | "beta" | "coming_soon";
export type CTAPriority = "primary" | "secondary" | "tertiary";

export interface PublicCTAProps extends Omit<ButtonProps, "asChild"> {
  variant?: CTAVariant;
  priority?: CTAPriority;
  /** Override destination for logged-in users (must be internal path) */
  appDestination?: string;
  /** Override label */
  label?: string;
  className?: string;
  showIcon?: boolean;
}

/** Map priority → shadcn Button variant */
const priorityToButtonVariant: Record<CTAPriority, ButtonProps["variant"]> = {
  primary:   "default",
  secondary: "outline",
  tertiary:  "ghost",
};

function InterestActionButton({
  label,
  priority,
  size,
  className,
  showIcon,
  icon,
  rest,
}: {
  label: string;
  priority: CTAPriority;
  size: ButtonProps["size"];
  className?: string;
  showIcon: boolean;
  icon?: ReactNode;
  rest: Omit<ButtonProps, "asChild">;
}) {
  return (
    <Button
      variant={priorityToButtonVariant[priority]}
      size={size}
      className={cn("gap-2", className)}
      {...rest}
    >
      {icon}
      {label}
      {showIcon && !icon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </Button>
  );
}

export function PublicCTA({
  variant = "default",
  priority = "primary",
  appDestination,
  label,
  className,
  showIcon = true,
  size = "default",
  ...rest
}: PublicCTAProps) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <Button
        variant={priorityToButtonVariant[priority]}
        size={size}
        disabled
        className={cn("min-w-[120px]", className)}
        {...rest}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="sr-only">{t("common.loading")}</span>
      </Button>
    );
  }

  // ── COMING SOON variant ────────────────────────────────────────────────────
  // Interest-capture only — does NOT create an account.
  // Phase 2E will wire this to a real backend notify-me workflow.
  if (variant === "coming_soon") {
    return (
      <InterestActionButton
        label={label ?? t("cta.notifyMe")}
        priority={priority}
        size={size}
        className={className}
        showIcon={showIcon}
        icon={<Bell className="h-4 w-4" aria-hidden="true" />}
        rest={rest}
      />
    );
  }

  // ── BETA variant ───────────────────────────────────────────────────────────
  // Interest-capture only — does NOT create an account.
  // Phase 2E will wire this to a real backend beta-request workflow.
  if (variant === "beta") {
    return (
      <InterestActionButton
        label={label ?? t("cta.requestBeta")}
        priority={priority}
        size={size}
        className={className}
        showIcon={showIcon}
        rest={rest}
      />
    );
  }

  // ── DEFAULT variant ────────────────────────────────────────────────────────
  if (user) {
    // Logged in → go to dashboard or validated app destination
    const dest = appDestination ?? "/dashboard";
    const safeDest = validateInternalPath(dest) ?? "/dashboard";
    return (
      <Button
        variant={priorityToButtonVariant[priority]}
        size={size}
        className={cn("gap-2", className)}
        asChild
        {...rest}
      >
        <Link to={safeDest}>
          {label ?? t("cta.goToDashboard")}
          {showIcon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Link>
      </Button>
    );
  }

  // Logged out → login with safe intended app destination using `next` contract
  const loginHref = buildLoggedOutCtaLoginHref(appDestination);

  return (
    <Button
      variant={priorityToButtonVariant[priority]}
      size={size}
      className={cn("gap-2", className)}
      asChild
      {...rest}
    >
      <Link to={loginHref}>
        {label ?? t("cta.getStarted")}
        {showIcon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </Link>
    </Button>
  );
}

/**
 * PublicCTAPair — renders a primary + secondary CTA side by side.
 * Common pattern: "Get Started" + "Learn More"
 */
export function PublicCTAPair({
  primaryLabel,
  secondaryLabel,
  secondaryHref = "/platform/ai",
  appDestination,
  className,
}: {
  primaryLabel?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  appDestination?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { localizedPath } = usePublicLocale();
  const safeSecondary = validateInternalPath(secondaryHref) ?? "/";

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <PublicCTA
        priority="primary"
        size="lg"
        appDestination={appDestination}
        label={primaryLabel}
      />
      <Button variant="outline" size="lg" asChild>
        <Link to={localizedPath(safeSecondary)}>
          {secondaryLabel ?? t("cta.learnMore")}
        </Link>
      </Button>
    </div>
  );
}
