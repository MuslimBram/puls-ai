import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Require2FASetup } from "@/components/Require2FASetup";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ["subscription-payment-status", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("payment_status, trial_end")
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

  // Check payment status - allow access if paid, in active trial, or has bypass role
  if (!hasBypassRole && subscription && location.pathname !== "/complete-payment") {
    const isPaid = subscription.payment_status === "paid";
    const isTrialActive =
      subscription.payment_status === "trial" &&
      subscription.trial_end &&
      new Date(subscription.trial_end) > new Date();

    if (!isPaid && !isTrialActive) {
      return <Navigate to="/complete-payment" replace />;
    }
  }

  return (
    <Require2FASetup>
      {children}
    </Require2FASetup>
  );
};
