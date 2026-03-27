import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Require2FASetup } from "@/components/Require2FASetup";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, Clock } from "lucide-react";
import { differenceInDays } from "date-fns";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [showTrialExpiredPopup, setShowTrialExpiredPopup] = useState(true);

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

  // Check if user has admin/super_admin/owner role (bypass payment)
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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin, super_admin, and owner bypass payment gate entirely
  const bypassRoles = ["admin", "super_admin", "business_owner"];
  const hasBypassRole = userRoles?.some((role) => bypassRoles.includes(role)) ?? false;

  // Check payment status
  if (!hasBypassRole && subscription && location.pathname !== "/complete-payment") {
    const isPaid = subscription.payment_status === "paid";
    const isTrialActive =
      subscription.payment_status === "trial" &&
      subscription.trial_end &&
      new Date(subscription.trial_end) > new Date();

    if (!isPaid && !isTrialActive) {
      // Calculate days since registration
      const daysSinceRegistration = subscription.created_at
        ? differenceInDays(new Date(), new Date(subscription.created_at))
        : 0;
      const daysUntilDeletion = Math.max(30 - daysSinceRegistration, 0);

      // Show popup overlay instead of immediate redirect
      if (showTrialExpiredPopup) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <Dialog open={true} onOpenChange={() => {}}>
              <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Prova Juaj ka Skaduar
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Provë 7-ditore ka përfunduar. Zgjidhni një paketë për të vazhduar përdorimin e platformës.
                  </p>

                  {daysUntilDeletion > 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                      <Clock className="h-4 w-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive">
                        Llogaria juaj do fshihet automatikisht pas <strong>{daysUntilDeletion} ditëve</strong> nëse nuk kryeni pagesë.
                      </p>
                    </div>
                  )}

                  {daysUntilDeletion === 0 && (
                    <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive font-medium">
                        Afati ka kaluar! Llogaria juaj mund të fshihet në çdo moment.
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => {
                      setShowTrialExpiredPopup(false);
                      window.location.href = "/complete-payment";
                    }}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Zgjidhni Paketën
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Mund të fitoni para nga referimet dhe të paguani nga portofoli.
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        );
      }

      return <Navigate to="/complete-payment" replace />;
    }
  }

  return (
    <Require2FASetup>
      {children}
    </Require2FASetup>
  );
};
