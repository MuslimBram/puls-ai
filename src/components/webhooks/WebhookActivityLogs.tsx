import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Search, Activity, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const statusConfig: Record<string, { icon: any; color: string }> = {
  received: { icon: Clock, color: "text-blue-500" },
  processed: { icon: CheckCircle2, color: "text-[hsl(var(--success))]" },
  failed: { icon: XCircle, color: "text-destructive" },
  duplicate: { icon: AlertTriangle, color: "text-yellow-500" },
};

export const WebhookActivityLogs = () => {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["webhook-activity-logs", sourceFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("webhook_activity_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 30000,
  });

  const filtered = (logs || []).filter((log: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.source?.toLowerCase().includes(term) ||
      log.event_type?.toLowerCase().includes(term) ||
      log.sender_id?.toLowerCase().includes(term) ||
      log.payload_preview?.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: logs?.length || 0,
    processed: logs?.filter((l: any) => l.status === "processed").length || 0,
    failed: logs?.filter((l: any) => l.status === "failed").length || 0,
    avgTime: logs?.length
      ? Math.round(
          logs.filter((l: any) => l.processing_time_ms).reduce((s: number, l: any) => s + (l.processing_time_ms || 0), 0) /
          Math.max(logs.filter((l: any) => l.processing_time_ms).length, 1)
        )
      : 0,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Webhook Activity Logs
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-[hsl(var(--success))]">{stats.processed}</p>
            <p className="text-xs text-muted-foreground">Processed</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{stats.avgTime}ms</p>
            <p className="text-xs text-muted-foreground">Avg Time</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="meta_test">Test</SelectItem>
              <SelectItem value="custom_webhook">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="duplicate">Duplicate</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Log entries */}
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Activity className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No webhook activity yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((log: any) => {
                const config = statusConfig[log.status] || statusConfig.received;
                const Icon = config.icon;
                return (
                  <div key={log.id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors">
                    <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{log.source}</Badge>
                        <Badge variant={log.status === "processed" ? "default" : log.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                          {log.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{log.event_type}</span>
                        {log.processing_time_ms && (
                          <span className="text-xs text-muted-foreground ml-auto">{log.processing_time_ms}ms</span>
                        )}
                      </div>
                      {log.payload_preview && (
                        <p className="text-xs text-muted-foreground truncate max-w-[500px] font-mono">
                          {log.payload_preview}
                        </p>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                        {log.ip_address && ` · ${log.ip_address}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
