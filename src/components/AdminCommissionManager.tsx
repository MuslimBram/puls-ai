import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, DollarSign, Receipt, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-blue-500/10 text-blue-700",
  paid: "bg-green-500/10 text-green-700",
  cancelled: "bg-destructive/10 text-destructive",
  requested: "bg-yellow-500/10 text-yellow-700",
  sent: "bg-green-500/10 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
};

export const AdminCommissionManager = () => {
  const queryClient = useQueryClient();

  const { data: commissions = [], isLoading: commLoading } = useQuery({
    queryKey: ["admin-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_commissions")
        .select("*, partner_accounts(partner_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payouts = [], isLoading: payLoading } = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("*, partner_accounts(partner_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const approveCommission = useMutation({
    mutationFn: async (commissionId: string) => {
      // Get commission details
      const { data: comm, error: fetchErr } = await supabase
        .from("partner_commissions")
        .select("*")
        .eq("id", commissionId)
        .single();
      if (fetchErr) throw fetchErr;

      // Update status
      const { error } = await supabase
        .from("partner_commissions")
        .update({ commission_status: "approved" })
        .eq("id", commissionId);
      if (error) throw error;

      // Move from pending to balance in wallet
      const { data: wallet } = await supabase
        .from("partner_wallets")
        .select("*")
        .eq("partner_id", comm.partner_id)
        .single();

      if (wallet) {
        const amount = Number(comm.commission_amount);
        await supabase
          .from("partner_wallets")
          .update({
            current_balance: Number(wallet.current_balance) + amount,
            lifetime_earnings: Number(wallet.lifetime_earnings) + amount,
            pending_amount: Math.max(0, Number(wallet.pending_amount) - amount),
            updated_at: new Date().toISOString(),
          })
          .eq("partner_id", comm.partner_id);

        await supabase.from("partner_wallet_transactions").insert({
          partner_id: comm.partner_id,
          type: "commission_credit",
          amount,
          reference_id: commissionId,
          description: `Commission approved: ${comm.plan_name}`,
        } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      toast.success("Commission approved and credited to wallet");
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelCommission = useMutation({
    mutationFn: async (commissionId: string) => {
      const { data: comm } = await supabase
        .from("partner_commissions")
        .select("partner_id, commission_amount")
        .eq("id", commissionId)
        .single();

      const { error } = await supabase
        .from("partner_commissions")
        .update({ commission_status: "cancelled" })
        .eq("id", commissionId);
      if (error) throw error;

      if (comm) {
        const { data: wallet } = await supabase
          .from("partner_wallets")
          .select("pending_amount")
          .eq("partner_id", comm.partner_id)
          .single();

        if (wallet) {
          await supabase
            .from("partner_wallets")
            .update({
              pending_amount: Math.max(0, Number(wallet.pending_amount) - Number(comm.commission_amount)),
              updated_at: new Date().toISOString(),
            })
            .eq("partner_id", comm.partner_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      toast.success("Commission cancelled");
    },
    onError: (e) => toast.error(e.message),
  });

  const approvePayout = useMutation({
    mutationFn: async (payoutId: string) => {
      const { data: payout, error: fetchErr } = await supabase
        .from("payout_requests")
        .select("*")
        .eq("id", payoutId)
        .single();
      if (fetchErr) throw fetchErr;

      // Deduct from wallet balance
      const { data: wallet } = await supabase
        .from("partner_wallets")
        .select("*")
        .eq("partner_id", payout.partner_id)
        .single();

      if (!wallet || Number(wallet.current_balance) < Number(payout.requested_amount)) {
        throw new Error("Insufficient wallet balance");
      }

      await supabase
        .from("partner_wallets")
        .update({
          current_balance: Number(wallet.current_balance) - Number(payout.requested_amount),
          updated_at: new Date().toISOString(),
        })
        .eq("partner_id", payout.partner_id);

      await supabase.from("partner_wallet_transactions").insert({
        partner_id: payout.partner_id,
        type: "payout",
        amount: -Number(payout.requested_amount),
        reference_id: payoutId,
        description: "Payout approved",
      } as any);

      const { error } = await supabase
        .from("payout_requests")
        .update({ payout_status: "approved", processed_at: new Date().toISOString() })
        .eq("id", payoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      toast.success("Payout approved");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectPayout = useMutation({
    mutationFn: async (payoutId: string) => {
      const { error } = await supabase
        .from("payout_requests")
        .update({ payout_status: "rejected", processed_at: new Date().toISOString() })
        .eq("id", payoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      toast.success("Payout rejected");
    },
    onError: (e) => toast.error(e.message),
  });

  const triggerCommissionGeneration = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-commissions");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      toast.success(`Generated ${data?.generated || 0} new commissions`);
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingCommissions = commissions.filter((c: any) => c.commission_status === "pending");
  const pendingPayouts = payouts.filter((p: any) => p.payout_status === "requested");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Badge variant="outline">{pendingCommissions.length} pending commissions</Badge>
          <Badge variant="outline">{pendingPayouts.length} pending payouts</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => triggerCommissionGeneration.mutate()}
          disabled={triggerCommissionGeneration.isPending}
        >
          {triggerCommissionGeneration.isPending ? (
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
          ) : (
            <DollarSign className="mr-2 h-3 w-3" />
          )}
          Generate Commissions
        </Button>
      </div>

      <Tabs defaultValue="commissions">
        <TabsList>
          <TabsTrigger value="commissions">
            <Receipt className="h-3 w-3 mr-1" />
            Commissions
          </TabsTrigger>
          <TabsTrigger value="payouts">
            <DollarSign className="h-3 w-3 mr-1" />
            Payouts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commissions">
          {commLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : commissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No commissions recorded yet</p>
          ) : (
            <div className="space-y-2">
              {commissions.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {(c.partner_accounts as any)?.partner_name || "Unknown"} · {c.plan_name}
                      </p>
                      <Badge className={statusColor[c.commission_status] || ""}>
                        {c.commission_status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ${Number(c.gross_amount).toFixed(2)} × {c.commission_percent}% = ${Number(c.commission_amount).toFixed(2)}
                      {c.billing_period_start && ` · ${format(new Date(c.billing_period_start), "MMM yyyy")}`}
                    </p>
                  </div>
                  {c.commission_status === "pending" && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="default" onClick={() => approveCommission.mutate(c.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => cancelCommission.mutate(c.id)}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payouts">
          {payLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : payouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payout requests</p>
          ) : (
            <div className="space-y-2">
              {payouts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {(p.partner_accounts as any)?.partner_name || "Unknown"} · ${Number(p.requested_amount).toFixed(2)}
                      </p>
                      <Badge className={statusColor[p.payout_status] || ""}>{p.payout_status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "MMM d, yyyy")} · {p.payout_method}
                    </p>
                  </div>
                  {p.payout_status === "requested" && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="default" onClick={() => approvePayout.mutate(p.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectPayout.mutate(p.id)}>
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
