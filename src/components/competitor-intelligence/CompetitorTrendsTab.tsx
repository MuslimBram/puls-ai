import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface Trend {
  id: string;
  trend_value: string;
  trend_type: string;
  frequency: number;
  last_seen_at: string;
}

interface CompetitorTrendsTabProps {
  trends: Trend[];
}

export const CompetitorTrendsTab = ({ trends }: CompetitorTrendsTabProps) => {
  if (!trends.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">No trends detected yet. Scan competitors to discover trends.</CardContent></Card>
    );
  }

  return (
    <div className="space-y-2">
      {trends.map((trend) => (
        <Card key={trend.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">{trend.trend_value}</p>
                <p className="text-xs capitalize text-muted-foreground">{trend.trend_type}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{trend.frequency}x</Badge>
              <span className="text-[10px] text-muted-foreground">{format(new Date(trend.last_seen_at), "MMM d")}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
