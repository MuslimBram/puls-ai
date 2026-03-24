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

interface PayoutWithFraud {
  id: string;
  partner_id: string;
  requested_amount: number;
  payout_status: string;
  payout_method: string;
  bank_name: string | null;
  bank_iban: string | null;
  beneficiary_name: string | null;
  admin_note: string | null;
  ai_fraud_score: number | null;
  ai_fraud_reasons: string[] | null;
  ai_reviewed_at: string | null;
  created_at: string;
  processed_at: string | null;
}

export const AdminWithdrawalApproval = () => {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ["admin-all-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payout_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as PayoutWithFraud[];
    },
  });

  const runAiCheck = useMutation({
    mutationFn: async (payoutId: string) => {
      const { data, error } = await supabase.functions.invoke("ai-fraud-check", {
        body: { payout_request_id: payoutId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-payouts"] });
      toast.success("Analiza AI përfundoi");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("payout_requests")
        .update({
          payout_status: status,
          admin_note: adminNote || null,
          processed_at: status === "approved" || status === "rejected" ? new Date().toISOString() : null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-payouts"] });
      setSelectedId(null);
      setAdminNote("");
      toast.success("Statusi u përditësua");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getFraudBadge = (score: number | null) => {
    if (score === null) return <Badge variant="outline" className="text-[10px]">Pa analizë</Badge>;
    if (score <= 30) return <Badge variant="default" className="text-[10px] bg-green-600"><ShieldCheck className="h-3 w-3 mr-1" />I sigurt ({score})</Badge>;
    if (score <= 60) return <Badge variant="secondary" className="text-[10px] bg-amber-500 text-white"><ShieldAlert className="h-3 w-3 mr-1" />Kujdes ({score})</Badge>;
    return <Badge variant="destructive" className="text-[10px]"><ShieldX className="h-3 w-3 mr-1" />Rrezik ({score})</Badge>;
  };

  const pendingPayouts = payouts.filter((p) => p.payout_status === "pending");
  const processedPayouts = payouts.filter((p) => p.payout_status !== "pending");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Kërkesat e tërheqjes — Aprovimi me AI
          </CardTitle>
          <CardDescription>
            AI analizon çdo kërkesë para aprovimit për të zbuluar mashtrime potenciale
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Duke ngarkuar...</p>
          ) : pendingPayouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Asnjë kërkesë në pritje</p>
          ) : (
            <div className="space-y-3">
              {pendingPayouts.map((p) => (
                <div key={p.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">€{p.requested_amount.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "dd MMM yyyy, HH:mm")} • {p.payout_method}
                      </p>
                    </div>
                    {getFraudBadge(p.ai_fraud_score)}
                  </div>

                  {/* Bank details */}
                  {(p.bank_name || p.bank_iban) && (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Banka:</span>
                        <p className="font-medium text-foreground">{p.bank_name || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IBAN:</span>
                        <p className="font-medium text-foreground font-mono">{p.bank_iban || "—"}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Përfituesi:</span>
                        <p className="font-medium text-foreground">{p.beneficiary_name || "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* AI fraud reasons */}
                  {p.ai_fraud_reasons && (p.ai_fraud_reasons as string[]).length > 0 && (
                    <div className="rounded bg-muted/50 p-2 space-y-1">
                      <p className="text-xs font-medium text-foreground">Gjetjet e AI:</p>
                      {(p.ai_fraud_reasons as string[]).map((r, i) => (
                        <p key={i} className="text-xs text-muted-foreground">• {r}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAiCheck.mutate(p.id)}
                      disabled={runAiCheck.isPending}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {p.ai_reviewed_at ? "Ri-analizo" : "Analizo me AI"}
                    </Button>

                    {selectedId === p.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Textarea
                          placeholder="Shënim admini (opsional)..."
                          value={adminNote}
                          onChange={(e) => setAdminNote(e.target.value)}
                          className="text-xs h-8 min-h-0"
                        />
                        <Button size="sm" onClick={() => updateStatus.mutate({ id: p.id, status: "approved" })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovo
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ id: p.id, status: "rejected" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Refuzo
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setSelectedId(p.id)}>
                        Vendos
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processed history */}
      {processedPayouts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historiku i vendimeve</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {processedPayouts.slice(0, 20).map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">€{p.requested_amount.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(p.created_at), "dd MMM yyyy")}
                      {p.admin_note && ` • ${p.admin_note}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getFraudBadge(p.ai_fraud_score)}
                    <Badge
                      variant={p.payout_status === "approved" ? "default" : p.payout_status === "rejected" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {p.payout_status === "approved" ? "Aprovuar" : p.payout_status === "rejected" ? "Refuzuar" : p.payout_status}
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
