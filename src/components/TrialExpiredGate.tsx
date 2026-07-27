// src/components/TrialExpiredGate.tsx
// Banner informativ — NUK bllokon aksesin te platforma
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, X } from "lucide-react";
import { differenceInDays } from "date-fns";

export const TrialExpiredGate = ({ children }: { children: React.ReactNode }) => {
  const { subscription, isTrialExpired, isLoading } = useSubscription();
  const { hasRole } = useRolePermissions();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  // Gjithmonë shfaq fëmijët
  if (isLoading) return <>{children}</>;
  if (hasRole("admin") || hasRole("super_admin")) return <>{children}</>;

  const paymentStatus = subscription?.payment_status as string | undefined;
  const isExpired = isTrialExpired || paymentStatus === "expired" || paymentStatus === "unpaid";

  if (!isExpired || dismissed) return <>{children}</>;

  const createdAt = subscription?.created_at ? new Date(subscription.created_at) : new Date();
  const daysUntilDeletion = Math.max(0, 30 - differenceInDays(new Date(), createdAt));

  return (
    <>
      {/* Banner — vetëm informativ */}
      <div className="w-full bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Trialu ka skaduar.</strong>{" "}
              {daysUntilDeletion > 0
                ? `Llogaria fshihet pas ${daysUntilDeletion} ditësh pa pagesë.`
                : "Afati i fshirjes ka kaluar."}
              {" "}Mund të fitosh nga referime dhe të paguash me wallet.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => navigate("/complete-payment")}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Zgjedh Plan
            </Button>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-500 hover:text-amber-700 p-1"
              aria-label="Mbyll"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {children}
    </>
  );
};
