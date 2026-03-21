import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { CompetitorAlert } from "@/hooks/useCompetitors";
import { ALERT_ICONS, SEVERITY_STYLES } from "./constants";

interface CompetitorAlertsListProps {
  alerts: CompetitorAlert[] | undefined;
  onMarkRead: (id: string) => void;
}

export const CompetitorAlertsList = ({ alerts, onMarkRead }: CompetitorAlertsListProps) => {
  if (!alerts?.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>No alerts yet. Alerts are generated when changes are detected during competitor scans.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const Icon = ALERT_ICONS[alert.alert_type] || AlertTriangle;
        return (
          <Card key={alert.id} className={`${SEVERITY_STYLES[alert.severity] || ""} ${!alert.is_read ? "ring-1 ring-primary/20" : "opacity-75"}`}>
            <CardContent className="flex items-start gap-3 py-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${alert.severity === "high" ? "text-destructive" : alert.severity === "medium" ? "text-yellow-600" : "text-primary"}`} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{alert.title}</p>
                  <Badge variant={alert.severity === "high" ? "destructive" : "secondary"} className="shrink-0 text-[10px]">{alert.severity}</Badge>
                  {!alert.is_read && <Badge className="shrink-0 text-[10px]">New</Badge>}
                </div>
                {alert.description && <p className="line-clamp-2 text-xs text-muted-foreground">{alert.description}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">{format(new Date(alert.created_at), "MMM d, HH:mm")}</p>
              </div>
              {!alert.is_read && (
                <Button size="sm" variant="ghost" className="shrink-0 text-xs" onClick={() => onMarkRead(alert.id)}>
                  Mark read
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
