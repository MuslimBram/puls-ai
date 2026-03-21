import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Eye, RefreshCw, Trash2, Plus, Loader2, Calendar, Shield } from "lucide-react";
import { format } from "date-fns";
import type { Competitor, CompetitorAlert } from "@/hooks/useCompetitors";
import { getDueStatus, SCAN_FREQUENCIES } from "./constants";

interface CompetitorListProps {
  competitors: Competitor[] | undefined;
  alerts: CompetitorAlert[];
  isLoading: boolean;
  onView: (c: Competitor) => void;
  onScan: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onUpdateFrequency: (id: string, freq: string) => void;
  isScanPending: boolean;
}

export const CompetitorList = ({
  competitors, alerts, isLoading, onView, onScan, onDelete, onAdd, onUpdateFrequency, isScanPending,
}: CompetitorListProps) => {
  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!competitors?.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="mb-2 text-lg font-medium">No competitors tracked</p>
          <p className="mb-4 text-sm text-muted-foreground">Add competitors to monitor their strategy with daily or weekly scanning.</p>
          <Button onClick={onAdd}><Plus className="mr-2 h-4 w-4" /> Add Competitor</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {competitors.map((comp) => {
        const dueStatus = getDueStatus(comp);
        const relatedAlerts = alerts.filter((a) => a.competitor_id === comp.id);
        const unreadForComp = relatedAlerts.filter((a) => !a.is_read).length;

        return (
          <Card key={comp.id} className="transition-colors hover:border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="truncate">{comp.name}</span>
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{comp.category}</Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      <Calendar className="mr-1 h-3 w-3" />{comp.scan_frequency}
                    </Badge>
                    <Badge variant={dueStatus === "due" ? "destructive" : "outline"} className="text-[10px] capitalize">
                      {dueStatus === "manual" ? "manual" : dueStatus}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onView(comp)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => onScan(comp.id)} disabled={isScanPending}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(comp.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {comp.website_url && <p className="truncate text-xs text-muted-foreground">{comp.website_url}</p>}
              {comp.ai_summary ? (
                <p className="line-clamp-3 text-sm text-muted-foreground">{comp.ai_summary}</p>
              ) : (
                <p className="text-xs italic text-muted-foreground">Not scanned yet</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alerts</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{relatedAlerts.length}</p>
                  <p className="text-[10px] text-muted-foreground">{unreadForComp} unread</p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pricing</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {comp.pricing_snapshot?.has_pricing ? "Detected" : "Unknown"}
                  </p>
                  <p className="line-clamp-1 text-[10px] text-muted-foreground">{comp.pricing_snapshot?.pricing_summary || "Scan required"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                {comp.last_scanned_at ? (
                  <p className="text-[10px] text-muted-foreground">Last scanned: {format(new Date(comp.last_scanned_at), "MMM d, yyyy HH:mm")}</p>
                ) : <span />}
                <Select value={comp.scan_frequency} onValueChange={(v) => onUpdateFrequency(comp.id, v)}>
                  <SelectTrigger className="h-6 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCAN_FREQUENCIES.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
