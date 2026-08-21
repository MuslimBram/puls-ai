/**
 * PublicPageContainer — standard content container for public marketing pages.
 *
 * Provides consistent max-width, padding, and spacing for public pages.
 * Use inside PublicShell, outside the header/footer.
 */

import { cn } from "@/lib/utils";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";
import type { ReactNode } from "react";

interface PublicPageContainerProps {
  children: ReactNode;
  /** Override breadcrumbs. Pass empty array to hide. */
  breadcrumbs?: BreadcrumbItem[];
  /** Whether to show breadcrumbs (default: true) */
  showBreadcrumbs?: boolean;
  /** Optional hero-width (default: max-w-7xl) */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "7xl" | "full";
  className?: string;
  /** Additional padding override */
  noPadding?: boolean;
}

const maxWidthMap = {
  sm:   "max-w-sm",
  md:   "max-w-md",
  lg:   "max-w-lg",
  xl:   "max-w-xl",
  "2xl": "max-w-2xl",
  "7xl": "max-w-7xl",
  full: "max-w-full",
} as const;

export function PublicPageContainer({
  children,
  breadcrumbs,
  showBreadcrumbs = true,
  maxWidth = "7xl",
  className,
  noPadding = false,
}: PublicPageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        maxWidthMap[maxWidth],
        !noPadding && "px-4 sm:px-6 lg:px-8",
        className,
      )}
    >
      {showBreadcrumbs && (
        <div className="py-3">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * PublicSection — reusable section wrapper with consistent spacing.
 */
export function PublicSection({
  children,
  className,
  id,
  "aria-labelledby": ariaLabelledBy,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cn("py-16 sm:py-20 lg:py-24", className)}
    >
      {children}
    </section>
  );
}

/**
 * PublicSectionHeader — heading + sub-heading pattern for sections.
 */
export function PublicSectionHeader({
  eyebrow,
  title,
  description,
  className,
  centered = false,
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  centered?: boolean;
  id?: string;
}) {
  return (
    <div className={cn("mb-10 space-y-3", centered && "text-center mx-auto max-w-2xl", className)}>
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
      )}
      <h2
        id={id}
        className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
      >
        {title}
      </h2>
      {description && (
        <p className="text-lg text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
