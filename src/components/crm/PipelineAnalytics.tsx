import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PipelineAnalyticsProps {
  stageStats: { name: string; color: string; count: number; value: number }[];
  totalDeals: number;
  wonDeals: number;
  lostDeals: number;
  winRate: number;
}

export const PipelineAnalytics = ({ stageStats, totalDeals, wonDeals, lostDeals, winRate }: PipelineAnalyticsProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Pipeline Analytics</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stageStats.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-foreground w-32 truncate">{s.name}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${totalDeals > 0 ? (s.count / totalDeals) * 100 : 0}%`,
                  backgroundColor: s.color,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{s.count}</span>
            <span className="text-xs font-medium text-foreground w-20 text-right">${s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-border">
        <div className="text-center">
          <p className="text-xl font-bold text-green-500">{wonDeals}</p>
          <p className="text-xs text-muted-foreground">Won</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-red-500">{lostDeals}</p>
          <p className="text-xs text-muted-foreground">Lost</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-foreground">{winRate}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </div>
    </CardContent>
  </Card>
);
