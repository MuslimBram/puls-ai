import { Card, CardContent } from "@/components/ui/card";
import { Headphones, AlertTriangle, Timer, Clock } from "lucide-react";

interface HelpdeskStatsRowProps {
  total: number;
  overdue: number;
  avgResponseTime: number;
  inProgressCount: number;
}

export const HelpdeskStatsRow = ({ total, overdue, avgResponseTime, inProgressCount }: HelpdeskStatsRowProps) => (
  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Headphones className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{total}</p>
          <p className="text-xs text-muted-foreground">Total Conversations</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{overdue}</p>
          <p className="text-xs text-muted-foreground">SLA Overdue</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
          <Timer className="h-4 w-4 text-secondary-foreground" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{avgResponseTime}m</p>
          <p className="text-xs text-muted-foreground">Avg Response</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 pt-4 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
          <Clock className="h-4 w-4 text-yellow-700" />
        </div>
        <div>
          <p className="text-xl font-bold text-foreground">{inProgressCount}</p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </div>
      </CardContent>
    </Card>
  </div>
);
