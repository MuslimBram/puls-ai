import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, XCircle, Shield, AlertTriangle, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { useState } from "react";

const statusColor: Record<string, string> = {
  requested: "bg-yellow-500/10 text-yellow-700",
  approved: "bg-blue-500/10 text-blue-700",
  processed: "bg-green-500/10 text-green-700",
  rejected: "bg-destructive/10 text-destructive",
};

const severityColor: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/10 text-yellow-700",
  high: "bg-destructive/10 text-destructive",
};

export const AdminRefundPanel = () => {
  const queryClient = useQueryClient();
  const [expandedUsage, setExpandedUsage] = useState<string | null>(null);

  const { data: refunds = [], isLoading: refundsLoading } = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_refunds")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: riskFlags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["admin-risk-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_risk_flags")
        .select("*, partner_accounts(partner_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const approveRefund = useMutation({
    mutationFn: async (refundId: string) => {
      const { error } = await supabase
        .from("subscription_refunds")
        .update({ refund_status: "approved", updated_at: new Date().toISOString() })
        .eq("id", refundId);
      if (error) throw error;

      // Cancel related commissions
      const { data: refund } = await supabase
        .from("subscription_refunds")
        .select("workspace_id")
        .eq("id", refundId)
        .single();

      if (refund?.workspace_id) {
        await supabase
          .from("partner_commissions")
          .update({ commission_status: "cancelled" })
          .eq("workspace_id", refund.workspace_id)
          .in("commission_status", ["pending", "pending_refund_window"]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["admin-commissions"] });
      toast.success("Refund approved. Process via Stripe dashboard to complete.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectRefund = useMutation({
    mutationFn: async (refundId: string) => {
      const { error } = await supabase
        .from("subscription_refunds")
        .update({ refund_status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", refundId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      toast.success("Refund rejected");
    },
    onError: (e) => toast.error(e.message),
  });

  const resolveFlag = useMutation({
    mutationFn: async (flagId: string) => {
      const { error } = await supabase
        .from("partner_risk_flags")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", flagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-risk-flags"] });
      toast.success("Flag resolved");
    },
    onError: (e) => toast.error(e.message),
  });

  const freezePartner = useMutation({
    mutationFn: async (partnerId: string) => {
      const { error } = await supabase
        .from("partner_accounts")
        .update({ status: "suspended" })
        .eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-risk-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      toast.success("Partner account frozen");
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingRefunds = refunds.filter((r: any) => r.refund_status === "requested");
  const unresolvedFlags = riskFlags.filter((f: any) => !f.is_resolved);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Badge variant="outline">{pendingRefunds.length} pending refunds</Badge>
        <Badge variant={unresolvedFlags.length > 0 ? "destructive" : "outline"}>
          {unresolvedFlags.length} risk flags
        </Badge>
      </div>

      <Tabs defaultValue="refunds">
        <TabsList>
          <TabsTrigger value="refunds">
            <Shield className="h-3 w-3 mr-1" />
            Refunds
          </TabsTrigger>
          <TabsTrigger value="risks">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Risk Flags
          </TabsTrigger>
        </TabsList>

        <TabsContent value="refunds">
          {refundsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : refunds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No refund requests</p>
          ) : (
            <div className="space-y-2">
              {refunds.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          ${Number(r.refund_amount).toFixed(2)} refund
                        </p>
                        <Badge className={statusColor[r.refund_status] || ""}>{r.refund_status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "MMM d, yyyy")} · Reason: {r.refund_reason || "N/A"}
                      </p>
                      {r.refund_window_expires_at && (
                        <p className="text-xs text-muted-foreground">
                          Window expires: {format(new Date(r.refund_window_expires_at), "MMM d, yyyy HH:mm")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedUsage(expandedUsage === r.id ? null : r.id)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {r.refund_status === "requested" && (
                        <>
                          <Button size="sm" variant="default" onClick={() => approveRefund.mutate(r.id)}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => rejectRefund.mutate(r.id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {expandedUsage === r.id && r.usage_snapshot_json && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs space-y-1">
                      <p className="font-medium text-foreground">Usage Snapshot:</p>
                      {Object.entries(r.usage_snapshot_json as Record<string, number>).map(([key, val]) => (
                        <p key={key} className="text-muted-foreground">{key}: {val}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="risks">
          {flagsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : riskFlags.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No risk flags</p>
          ) : (
            <div className="space-y-2">
              {riskFlags.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {(f.partner_accounts as any)?.partner_name || "Unknown"}
                      </p>
                      <Badge className={severityColor[f.severity] || ""}>{f.severity}</Badge>
                      <Badge variant="outline" className="text-xs">{f.flag_type}</Badge>
                      {f.is_resolved && <Badge className="bg-green-500/10 text-green-700">Resolved</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {f.description} · {format(new Date(f.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  {!f.is_resolved && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => resolveFlag.mutate(f.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => freezePartner.mutate(f.partner_id)}
                      >
                        Freeze Partner
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
