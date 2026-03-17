import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { AlertTriangle, RotateCcw, Trash2, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700",
  retrying: "bg-blue-500/10 text-blue-700",
  escalated: "bg-destructive/10 text-destructive",
  resolved: "bg-green-500/10 text-green-700",
};

export const AdminDeadLetterPanel = () => {
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: items, isLoading } = useQuery({
    queryKey: ["admin-dlq", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("dead_letter_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const retryAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("dead-letter-retry");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-dlq"] });
      toast.success(`Retry complete: ${data.retried} retried, ${data.escalated} escalated, ${data.resolved} resolved`);
    },
    onError: (e) => toast.error(e.message),
  });

  const retrySingle = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("dead_letter_queue")
        .update({ status: "pending", next_retry_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dlq"] });
      toast.success("Item queued for retry");
    },
    onError: (e) => toast.error(e.message),
  });

  const dismissItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("dead_letter_queue")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-dlq"] });
      toast.success("Item dismissed");
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingCount = items?.filter((i) => i.status === "pending" || i.status === "retrying").length ?? 0;
  const escalatedCount = items?.filter((i) => i.status === "escalated").length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Dead Letter Queue
            {pendingCount > 0 && (
              <Badge className="bg-yellow-500/10 text-yellow-700 text-xs">{pendingCount} pending</Badge>
            )}
            {escalatedCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive text-xs">{escalatedCount} escalated</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => retryAll.mutate()} disabled={retryAll.isPending}>
              <RefreshCw className={`h-3 w-3 mr-1 ${retryAll.isPending ? "animate-spin" : ""}`} />
              Retry All
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mb-2 text-primary" />
            <p className="text-sm">No dead letter items</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${STATUS_COLORS[item.status] || ""}`}>
                      {item.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{item.job_type}</span>
                    <span className="text-xs text-muted-foreground">
                      Retry {item.retry_count}/{item.max_retries}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.status !== "resolved" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => retrySingle.mutate(item.id)}
                          disabled={retrySingle.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-muted-foreground"
                          onClick={() => dismissItem.mutate(item.id)}
                          disabled={dismissItem.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {item.error_message && (
                  <p className="text-xs text-destructive mt-1 line-clamp-2">{item.error_message}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span>Created: {format(new Date(item.created_at), "MMM d, HH:mm")}</span>
                  {item.last_retry_at && <span>Last retry: {format(new Date(item.last_retry_at), "MMM d, HH:mm")}</span>}
                  {item.next_retry_at && item.status === "pending" && (
                    <span>Next: {format(new Date(item.next_retry_at), "MMM d, HH:mm")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
