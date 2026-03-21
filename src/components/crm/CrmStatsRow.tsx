import { Card, CardContent } from "@/components/ui/card";
import { Target, DollarSign, TrendingUp, CheckSquare } from "lucide-react";

interface CrmStatsRowProps {
  totalDeals: number;
  totalValue: number;
  winRate: number;
  openTasks: number;
}

export const CrmStatsRow = ({ totalDeals, totalValue, winRate, openTasks }: CrmStatsRowProps) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-primary/10 p-2"><Target className="h-5 w-5 text-primary" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">{totalDeals}</p>
          <p className="text-xs text-muted-foreground">Total Deals</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-green-500/10 p-2"><DollarSign className="h-5 w-5 text-green-500" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">${totalValue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Pipeline Value</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-blue-500/10 p-2"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">{winRate}%</p>
          <p className="text-xs text-muted-foreground">Win Rate</p>
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-amber-500/10 p-2"><CheckSquare className="h-5 w-5 text-amber-500" /></div>
        <div>
          <p className="text-2xl font-bold text-foreground">{openTasks}</p>
          <p className="text-xs text-muted-foreground">Open Tasks</p>
        </div>
      </CardContent>
    </Card>
  </div>
);
