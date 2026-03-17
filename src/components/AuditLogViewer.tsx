import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ScrollText, Search, Download, Filter, Clock, User, Shield,
  Settings, Key, Trash2, Edit, Eye, Loader2, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

const ACTION_ICONS: Record<string, typeof Shield> = {
  login: Key,
  logout: Key,
  session_revoke: Shield,
  channel_create: Settings,
  channel_delete: Trash2,
  channel_update: Edit,
  keyword_create: Settings,
  keyword_delete: Trash2,
  lead_view: Eye,
  broadcast_send: Settings,
  automation_create: Settings,
  automation_update: Edit,
  settings_update: Settings,
};

const ACTION_COLORS: Record<string, string> = {
  login: "text-primary",
  logout: "text-muted-foreground",
  session_revoke: "text-destructive",
  channel_delete: "text-destructive",
  keyword_delete: "text-destructive",
};

interface AuditEntry {
  id: string;
  action: string;
  actor_id: string;
  target_type: string | null;
  target_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const AuditLogViewer = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", user?.id, page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("actor_id", user!.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      return (data || []) as unknown as AuditEntry[];
    },
    enabled: !!user,
  });

  const logs = (data || []).filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        log.action.toLowerCase().includes(s) ||
        (log.target_type || "").toLowerCase().includes(s) ||
        (log.ip_address || "").includes(s)
      );
    }
    return true;
  });

  const uniqueActions = [...new Set((data || []).map((l) => l.action))].sort();

  const exportCSV = () => {
    const header = "Date,Action,Target Type,Target ID,IP Address\n";
    const rows = logs
      .map(
        (l) =>
          `"${format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss")}","${l.action}","${l.target_type || ""}","${l.target_id || ""}","${l.ip_address || ""}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatAction = (action: string) =>
    action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScrollText className="h-5 w-5 text-primary" />
              Activity Log
            </CardTitle>
            <CardDescription>
              A record of all actions performed on your account.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={logs.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actions, targets, IPs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {uniqueActions.map((a) => (
                <SelectItem key={a} value={a}>
                  {formatAction(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No audit events found.</p>
            <p className="text-xs text-muted-foreground">Actions you perform will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => {
              const Icon = ACTION_ICONS[log.action] || Settings;
              const colorClass = ACTION_COLORS[log.action] || "text-muted-foreground";
              const isDestructive = log.action.includes("delete") || log.action === "session_revoke";

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className={`mt-0.5 shrink-0 ${colorClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {formatAction(log.action)}
                      </span>
                      {log.target_type && (
                        <Badge variant="outline" className="text-xs">
                          {log.target_type}
                        </Badge>
                      )}
                      {isDestructive && (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                      </span>
                      {log.ip_address && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {log.ip_address}
                        </span>
                      )}
                      {log.target_id && (
                        <span className="truncate max-w-[200px]" title={log.target_id}>
                          ID: {log.target_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination */}
            <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
              <p className="text-xs text-muted-foreground">
                Showing {logs.length} entries (page {page + 1})
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs"
                  disabled={(data || []).length < pageSize}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
