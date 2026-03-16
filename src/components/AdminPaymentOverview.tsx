import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminWorkspacePayments } from "@/hooks/useWorkspacePayment";
import { useIsAdmin } from "@/hooks/useAdmin";
import { CreditCard, AlertTriangle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuditLog } from "@/hooks/useAuditLog";
import { toast } from "@/components/ui/sonner";

export const AdminPaymentOverview = () => {
  const { isAdmin } = useIsAdmin();
  const { data: workspaces, isLoading } = useAdminWorkspacePayments(isAdmin);
  const queryClient = useQueryClient();
  const { log } = useAuditLog();

  const flagAccount = async (wsId: string, accountIndex: number, reason: string) => {
    await supabase.from("payment_account_verifications").insert({
      workspace_id: wsId,
      account_index: accountIndex,
      flagged: true,
      flag_reason: reason,
    } as any);
    await log("payment_account_flagged", "workspace", wsId, { account_index: accountIndex, reason });
    queryClient.invalidateQueries({ queryKey: ["admin-workspace-payments"] });
    toast.success("Account flagged");
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const withPayments = workspaces?.filter(w => {
    const accounts = w.payment_accounts as any[];
    return accounts && accounts.length > 0;
  }) || [];

  const declared = workspaces?.filter(w => w.payment_mode === "declared_payment") || [];
  const undeclared = workspaces?.filter(w => w.payment_mode === "undeclared_payment") || [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-foreground">{declared.length}</p>
              <p className="text-xs text-muted-foreground">Declared Payment</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <XCircle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold text-foreground">{undeclared.length}</p>
              <p className="text-xs text-muted-foreground">Undeclared</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{withPayments.length}</p>
              <p className="text-xs text-muted-foreground">With Payment Accounts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Accounts by Business</CardTitle>
        </CardHeader>
        <CardContent>
          {withPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payment accounts configured</p>
          ) : (
            <div className="space-y-3">
              {withPayments.map((ws) => {
                const accounts = (ws.payment_accounts || []) as any[];
                return (
                  <div key={ws.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{ws.name}</p>
                        <Badge
                          variant="outline"
                          className={ws.payment_mode === "declared_payment"
                            ? "bg-green-500/10 text-green-700 text-xs"
                            : "bg-yellow-500/10 text-yellow-700 text-xs"}
                        >
                          {ws.payment_mode === "declared_payment" ? "Declared" : "Undeclared"}
                        </Badge>
                        {ws.workspace_owner_partner_id && (
                          <Badge variant="secondary" className="text-xs">Partner-owned</Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1 pl-4">
                      {accounts.map((acc: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{acc.type}</Badge>
                            <span className="text-foreground">{acc.label}</span>
                            <span className="text-muted-foreground font-mono">{acc.value?.substring(0, 20)}…</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-destructive"
                            onClick={() => flagAccount(ws.id, i, "Suspicious activity")}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Flag
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
