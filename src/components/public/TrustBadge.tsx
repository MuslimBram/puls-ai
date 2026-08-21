/**
 * TrustBadge — reusable trust/status indicator for the public website.
 *
 * Uses the centralized SECURITY_CLAIM from publicSecurityClaim.ts.
 * Never claims certifications not held.
 */

import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SECURITY_CLAIM } from "@/lib/publicSecurityClaim";
import { cn } from "@/lib/utils";

interface TrustBadgeProps {
  className?: string;
  /** Show full tooltip with disclaimer */
  showTooltip?: boolean;
}

export function TrustBadge({ className, showTooltip = true }: TrustBadgeProps) {
  const badge = (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium",
        "border border-border/60 bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {SECURITY_CLAIM.badgeLabel}
    </Badge>
  );

  if (!showTooltip) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-xs text-xs leading-relaxed"
      >
        {SECURITY_CLAIM.disclaimer}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * TrustBadgeRow — a horizontal row of trust indicators for hero / pricing sections.
 */
export function TrustBadgeRow({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      aria-label="Trust indicators"
    >
      {SECURITY_CLAIM.points.slice(0, 3).map((point) => (
        <Badge
          key={point}
          variant="secondary"
          className={cn(
            "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium",
            "border border-border/60 bg-muted/60 text-muted-foreground",
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {point}
        </Badge>
      ))}
      <TrustBadge showTooltip />
    </div>
  );
}
