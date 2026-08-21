/**
 * PublicCTA — auth-aware call-to-action components for the public website.
 *
 * Variants:
 *   DEFAULT    — Logged out → Login/Register with safe return destination
 *              — Logged in  → Go to Dashboard
 *   BETA       — Request Beta Access → /register?beta=1
 *   COMING_SOON — Notify Me → /register?notify=1
 *
 * Preserves safeNavigate / validateInternalPath security protections.
 * Never navigates to an unvalidated external URL.
 */

import { Link, useLocation } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { validateInternalPath } from "@/lib/safeNavigate";
import { cn } from "@/lib/utils";
import { ArrowRight, Bell, Loader2 } from "lucide-react";

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
  const location = useLocation();
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
  if (variant === "coming_soon") {
    const href = "/register?notify=1";
    return (
      <Button
        variant={priorityToButtonVariant[priority]}
        size={size}
        className={cn("gap-2", className)}
        asChild
        {...rest}
      >
        <Link to={href}>
          <Bell className="h-4 w-4" aria-hidden="true" />
          {label ?? t("cta.notifyMe")}
        </Link>
      </Button>
    );
  }

  // ── BETA variant ───────────────────────────────────────────────────────────
  if (variant === "beta") {
    const href = user ? (appDestination ?? "/dashboard") : "/register?beta=1";
    // Validate internal path to ensure safety
    const safeHref = validateInternalPath(href) ?? "/register";
    return (
      <Button
        variant={priorityToButtonVariant[priority]}
        size={size}
        className={cn("gap-2", className)}
        asChild
        {...rest}
      >
        <Link to={safeHref}>
          {label ?? t("cta.requestBeta")}
          {showIcon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Link>
      </Button>
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

  // Logged out → login with safe return path
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const loginHref = `/login?returnTo=${returnTo}`;

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
  secondaryHref = "/platform/ai-intelligence",
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
        <Link to={safeSecondary}>
          {secondaryLabel ?? t("cta.learnMore")}
        </Link>
      </Button>
    </div>
  );
}
