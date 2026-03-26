import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle, Bot, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface WithdrawalRow {
  id: string;
  user_id: string;
  wallet_id: string;
  currency: string;
  amount: number;
  status: string;
  ai_risk_score: number | null;
  ai_risk_reason: string | null;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export const AdminWithdrawalApproval = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-withdrawal-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as WithdrawalRow[];
    },
  });

  const rerunAi = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.functions.invoke("withdrawal-fraud-check", {
        body: { withdrawal_request_id: requestId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawal-requests"] });
      toast.success("Analiza AI përfundoi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("withdrawal_requests")
        .update({
          status,
          admin_notes: adminNote || null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;

      // If approved, deduct from wallet
      if (status === "approved") {
        const req = requests.find(r => r.id === id);
        if (req) {
          // Deduct balance
          const { data: wallet } = await supabase
            .from("user_wallets")
            .select("current_balance")
            .eq("id", req.wallet_id)
            .single();
          if (wallet) {
            await supabase.from("user_wallets").update({
              current_balance: (wallet.current_balance as number) - req.amount,
              lifetime_withdrawn: ((wallet as any).lifetime_withdrawn ?? 0) + req.amount,
            } as any).eq("id", req.wallet_id);

            await supabase.from("user_wallet_transactions").insert({
              wallet_id: req.wallet_id,
              user_id: req.user_id,
              type: "withdrawal",
              amount: -req.amount,
              currency: req.currency,
              description: "Tërheqje e aprovuar nga Admin",
            } as any);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-withdrawal-requests"] });
      queryClient.invalidateQueries({ queryKey: ["user-wallets"] });
      setSelectedId(null);
      setAdminNote("");
      toast.success("Statusi u përditësua");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getRiskBadge = (score: number | null, status: string) => {
    if (status === "pending_ai_review") return <Badge variant="outline" className="text-[10px]">Duke analizuar...</Badge>;
    if (score === null) return <Badge variant="outline" className="text-[10px]">Pa analizë</Badge>;
    if (score <= 30) return <Badge variant="default" className="text-[10px]"><ShieldCheck className="h-3 w-3 mr-1" />I sigurt ({score})</Badge>;
    if (score <= 60) return <Badge variant="secondary" className="text-[10px]"><ShieldAlert className="h-3 w-3 mr-1" />Kujdes ({score})</Badge>;
    return <Badge variant="destructive" className="text-[10px]"><ShieldX className="h-3 w-3 mr-1" />Rrezik ({score})</Badge>;
  };

  const pendingRequests = requests.filter((r) => r.status === "pending_admin_review" || r.status === "pending_ai_review");
  const processedRequests = requests.filter((r) => !["pending_admin_review", "pending_ai_review"].includes(r.status));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Kërkesat e tërheqjes — Verifikim AI + Admin
          </CardTitle>
          <CardDescription>
            Çdo kërkesë kalon fillimisht nga AI dhe pastaj kërkon aprovimin tuaj
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Duke ngarkuar...</p>
          ) : pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Asnjë kërkesë në pritje</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {r.amount.toFixed(2)} {r.currency}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy, HH:mm")} • User: {r.user_id.substring(0, 8)}...
                      </p>
                    </div>
                    {getRiskBadge(r.ai_risk_score, r.status)}
                  </div>

                  {r.ai_risk_reason && (
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs font-medium text-foreground">Gjetjet e AI:</p>
                      <p className="text-xs text-muted-foreground">{r.ai_risk_reason}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rerunAi.mutate(r.id)}
                      disabled={rerunAi.isPending}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {r.ai_risk_score !== null ? "Ri-analizo" : "Analizo me AI"}
                    </Button>

                    {r.status === "pending_admin_review" && (
                      selectedId === r.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Textarea
                            placeholder="Shënim admini (opsional)..."
                            value={adminNote}
                            onChange={(e) => setAdminNote(e.target.value)}
                            className="text-xs h-8 min-h-0"
                          />
                          <Button size="sm" onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovo
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })}>
                            <XCircle className="h-3 w-3 mr-1" /> Refuzo
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setSelectedId(r.id)}>
                          Vendos
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {processedRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historiku i vendimeve</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {processedRequests.slice(0, 20).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.amount.toFixed(2)} {r.currency}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
                      {r.admin_notes && ` • ${r.admin_notes}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRiskBadge(r.ai_risk_score, r.status)}
                    <Badge
                      variant={r.status === "approved" ? "default" : r.status === "rejected" || r.status === "blocked" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {r.status === "approved" ? "Aprovuar" : r.status === "rejected" ? "Refuzuar" : r.status === "blocked" ? "Bllokuar" : r.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
