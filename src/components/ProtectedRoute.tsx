import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Require2FASetup } from "@/components/Require2FASetup";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, X } from "lucide-react";
import { differenceInDays } from "date-fns";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription-payment-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("payment_status, trial_end, created_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: userRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["user-roles-bypass", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data || []).map((r) => r.role as string);
    },
    enabled: !!user,
    staleTime: 300000,
  });

  if (loading || subLoading || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Admin/super_admin: akses i plotë gjithmonë
  const bypassRoles = ["admin", "super_admin"];
  const hasBypassRole = userRoles?.some((role) => bypassRoles.includes(role)) ?? false;

  // Kontrollo nëse trial ka skaduar
  let showBanner = false;
  let daysUntilDeletion = 30;

  if (!hasBypassRole && subscription && location.pathname !== "/complete-payment") {
    const isPaid = subscription.payment_status === "paid";
    const isTrialActive =
      subscription.payment_status === "trial" &&
      subscription.trial_end &&
      new Date(subscription.trial_end) > new Date();

    if (!isPaid && !isTrialActive) {
      showBanner = true;
      const daysSinceRegistration = subscription.created_at
        ? differenceInDays(new Date(), new Date(subscription.created_at))
        : 0;
      daysUntilDeletion = Math.max(30 - daysSinceRegistration, 0);
    }
  }

  return (
    <Require2FASetup>
      <>
        {/* Banner informativ — NUK bllokon aksesin */}
        {showBanner && !bannerDismissed && (
          <div className="sticky top-0 z-50 w-full bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Trialu skadoi.</strong>{" "}
                  {daysUntilDeletion > 0
                    ? `Llogaria fshihet automatikisht pas ${daysUntilDeletion} ditësh.`
                    : "Llogaria mund të fshihet çdo moment."}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => window.location.href = "/complete-payment"}
                >
                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                  Zgjedh Plan
                </Button>
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="text-amber-600 hover:text-amber-800 p-1 rounded"
                  aria-label="Mbyll"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        {children}
      </>
    </Require2FASetup>
  );
};
