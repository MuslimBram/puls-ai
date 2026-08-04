import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Wallet, ArrowDownToLine, ShieldCheck, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatALL } from "@/lib/currency";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending_ai_review: { label: "Pending AI", variant: "secondary", icon: Clock },
  pending_admin_review: { label: "Pending Admin", variant: "outline", icon: ShieldCheck },
  approved: { label: "Approved", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  blocked: { label: "Blocked", variant: "destructive", icon: AlertTriangle },
};

export const AdminPlatformWallet = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: wallet } = useQuery({
    queryKey: ["platform-wallet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_wallet" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: withdrawals } = useQuery({
    queryKey: ["platform-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_withdrawal_requests" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const requestWithdrawal = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(withdrawAmount);
      if (!amount || amount <= 0) throw new Error("Invalid amount");
      if (wallet && amount > (wallet as any).balance) throw new Error("Insufficient balance");

      const { error } = await supabase
        .from("platform_withdrawal_requests" as any)
        .insert({
          requested_by: user!.id,
          amount,
          reason: withdrawReason || null,
          status: "pending_ai_review",
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdrawal request sent for AI verification");
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
      setWithdrawAmount("");
      setWithdrawReason("");
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const approveWithdrawal = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from("platform_withdrawal_requests" as any)
        .update({
          status: "approved",
          approved_by: user!.id,
          approval_notes: notes || null,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdrawal approved");
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["platform-wallet"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectWithdrawal = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("platform_withdrawal_requests" as any)
        .update({
          status: "rejected",
          rejected_reason: reason,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Withdrawal rejected");
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Platform Wallet
            </CardTitle>
            <CardDescription>Revenue collected from business payments</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Request Withdrawal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Platform Withdrawal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Amount (EUR)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Textarea
                    placeholder="Why are you withdrawing these funds..."
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The withdrawal will go through AI verification and approval from another Admin.
                </p>
                <Button
                  className="w-full"
                  onClick={() => requestWithdrawal.mutate()}
                  disabled={requestWithdrawal.isPending}
                >
                  Submit Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Balance</p>
              <p className="text-2xl font-bold text-foreground">
                {formatALL(((wallet as any)?.balance ?? 0))}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold text-primary">
                {formatALL(((wallet as any)?.total_revenue ?? 0))}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Total Withdrawn</p>
              <p className="text-2xl font-bold text-foreground">
                {formatALL(((wallet as any)?.total_withdrawn ?? 0))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal Requests</CardTitle>
          <CardDescription>AI + Admin dual approval</CardDescription>
        </CardHeader>
        <CardContent>
          {!withdrawals?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No requests yet.</p>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w: any) => {
                const cfg = statusConfig[w.status] ?? statusConfig.pending_ai_review;
                const Icon = cfg.icon;
                const isApprover = w.requested_by !== user?.id;
                const canApprove = isApprover && w.status === "pending_admin_review";

                return (
                  <div key={w.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{formatALL(Number(w.amount))}</p>
                        {w.reason && <p className="text-xs text-muted-foreground">{w.reason}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(w.created_at).toLocaleDateString("en")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {canApprove && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveWithdrawal.mutate({ id: w.id })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectWithdrawal.mutate({ id: w.id, reason: "Rejected by admin" })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
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
