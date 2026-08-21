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

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { validateInternalPath } from "@/lib/safeNavigate";
import { cn } from "@/lib/utils";
import { ArrowRight, Bell, CheckCircle2, Loader2 } from "lucide-react";

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

/**
 * ComingSoonNotifyButton — interest-capture stub for COMING_SOON variant.
 * Toggles a "Noted!" confirmation state locally.
 * Phase 2E will wire to a real backend notify-me workflow.
 */
function ComingSoonNotifyButton({
  label,
  priority,
  size,
  className,
  rest,
}: {
  label: string;
  priority: CTAPriority;
  size: ButtonProps["size"];
  className?: string;
  rest: Omit<ButtonProps, "asChild">;
}) {
  const [noted, setNoted] = useState(false);
  return (
    <Button
      variant={priorityToButtonVariant[priority]}
      size={size}
      className={cn("gap-2", className)}
      onClick={() => setNoted(true)}
      disabled={noted}
      {...rest}
    >
      {noted ? (
        <>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Noted!
        </>
      ) : (
        <>
          <Bell className="h-4 w-4" aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}

/**
 * BetaRequestButton — interest-capture stub for BETA variant (logged-out).
 * Toggles a "Request received!" confirmation state locally.
 * Phase 2E will wire to a real backend beta-request workflow.
 */
function BetaRequestButton({
  label,
  priority,
  size,
  className,
  showIcon,
  rest,
}: {
  label: string;
  priority: CTAPriority;
  size: ButtonProps["size"];
  className?: string;
  showIcon: boolean;
  rest: Omit<ButtonProps, "asChild">;
}) {
  const [requested, setRequested] = useState(false);
  return (
    <Button
      variant={priorityToButtonVariant[priority]}
      size={size}
      className={cn("gap-2", className)}
      onClick={() => setRequested(true)}
      disabled={requested}
      {...rest}
    >
      {requested ? (
        <>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Request received!
        </>
      ) : (
        <>
          {label}
          {showIcon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </>
      )}
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
  // Interest-capture only — does NOT create an account.
  // Phase 2E will wire this to a real backend notify-me workflow.
  if (variant === "coming_soon") {
    return (
      <ComingSoonNotifyButton
        label={label ?? t("cta.notifyMe")}
        priority={priority}
        size={size}
        className={className}
        rest={rest}
      />
    );
  }

  // ── BETA variant ───────────────────────────────────────────────────────────
  // Interest-capture only — does NOT create an account.
  // Phase 2E will wire this to a real backend beta-request workflow.
  if (variant === "beta") {
    if (user) {
      const safeDest = validateInternalPath(appDestination ?? "/dashboard") ?? "/dashboard";
      return (
        <Button
          variant={priorityToButtonVariant[priority]}
          size={size}
          className={cn("gap-2", className)}
          asChild
          {...rest}
        >
          <Link to={safeDest}>
            {label ?? t("cta.requestBeta")}
            {showIcon && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Link>
        </Button>
      );
    }
    return (
      <BetaRequestButton
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

  // Logged out → login with safe return path using the existing `next` contract
  const next = encodeURIComponent(location.pathname + location.search);
  const loginHref = `/login?next=${next}`;

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
