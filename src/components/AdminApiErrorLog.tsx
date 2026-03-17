import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApiErrors } from "@/hooks/useProductionInfra";
import { AlertCircle, Search, Server } from "lucide-react";
import { format } from "date-fns";

export const AdminApiErrorLog = () => {
  const { data: errors, isLoading } = useApiErrors();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = (errors ?? []).filter((e) => {
    const matchSearch =
      !search ||
      e.endpoint?.toLowerCase().includes(search.toLowerCase()) ||
      e.error_message?.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" || String(e.status_code)?.startsWith(statusFilter);
    return matchSearch && matchStatus;
  });

  const severityBadge = (code: number | null) => {
    if (!code) return <Badge variant="outline">Unknown</Badge>;
    if (code >= 500) return <Badge variant="destructive">5xx Server</Badge>;
    if (code >= 400) return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20">4xx Client</Badge>;
    return <Badge variant="secondary">{code}</Badge>;
  };

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading errors…</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-destructive" />
          API Error Log
          <Badge variant="outline" className="ml-auto">{filtered.length} errors</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search endpoint or error…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="5">5xx Server</SelectItem>
              <SelectItem value="4">4xx Client</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No API errors found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map((err) => (
              <div
                key={err.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="mt-0.5">{severityBadge(err.status_code)}</div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {err.method ?? "GET"}
                    </span>
                    <span className="text-sm font-medium truncate">{err.endpoint}</span>
                  </div>
                  {err.error_message && (
                    <p className="text-xs text-destructive truncate">{err.error_message}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(err.created_at), "MMM d, HH:mm:ss")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
