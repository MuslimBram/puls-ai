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

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending_ai_review: { label: "Në pritje AI", variant: "secondary", icon: Clock },
  pending_admin_review: { label: "Në pritje Admini", variant: "outline", icon: ShieldCheck },
  approved: { label: "Aprovuar", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Refuzuar", variant: "destructive", icon: XCircle },
  blocked: { label: "Bllokuar", variant: "destructive", icon: AlertTriangle },
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
      if (!amount || amount <= 0) throw new Error("Shuma e pavlefshme");
      if (wallet && amount > (wallet as any).balance) throw new Error("Balanca nuk mjafton");

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
      toast.success("Kërkesa për tërheqje u dërgua për verifikim AI");
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
      toast.success("Tërheqja u aprovua");
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
      toast.success("Tërheqja u refuzua");
      queryClient.invalidateQueries({ queryKey: ["platform-withdrawals"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* Wallet Balance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Portofoli i Platformës
            </CardTitle>
            <CardDescription>Të ardhurat e grumbulluara nga pagesat e bizneseve</CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                Kërko Tërheqje
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Kërko Tërheqje nga Platforma</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Shuma (EUR)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Arsyeja</Label>
                  <Textarea
                    placeholder="Pse po tërhiqni këto fonde..."
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tërheqja do të kalojë përmes verifikimit AI dhe aprovimit nga një Admin tjetër.
                </p>
                <Button
                  className="w-full"
                  onClick={() => requestWithdrawal.mutate()}
                  disabled={requestWithdrawal.isPending}
                >
                  Dërgo Kërkesën
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Balanca</p>
              <p className="text-2xl font-bold text-foreground">
                €{((wallet as any)?.balance ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Totali i të ardhurave</p>
              <p className="text-2xl font-bold text-primary">
                €{((wallet as any)?.total_revenue ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Totali i tërheqjeve</p>
              <p className="text-2xl font-bold text-foreground">
                €{((wallet as any)?.total_withdrawn ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Kërkesat për Tërheqje</CardTitle>
          <CardDescription>AI + Admin aprovim i dyfishtë</CardDescription>
        </CardHeader>
        <CardContent>
          {!withdrawals?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nuk ka kërkesa ende.</p>
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
                        <p className="text-sm font-medium">€{Number(w.amount).toFixed(2)}</p>
                        {w.reason && <p className="text-xs text-muted-foreground">{w.reason}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(w.created_at).toLocaleDateString("sq")}
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
                            Aprovo
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectWithdrawal.mutate({ id: w.id, reason: "Refuzuar nga admini" })}
                          >
                            Refuzo
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
