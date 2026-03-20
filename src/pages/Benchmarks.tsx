import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBenchmarks } from "@/hooks/useBenchmarks";
import { BarChart3, TrendingUp, Award, Target } from "lucide-react";

const Benchmarks = () => {
  const { scores, byCategory, avgPercentile, isLoading } = useBenchmarks();
  const categories = Object.keys(byCategory);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Benchmark Engine</h1>
          <p className="text-muted-foreground">Compare your performance against industry averages and top performers.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-4 text-center">
            <Award className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{avgPercentile}th</p>
            <p className="text-xs text-muted-foreground">Avg Percentile</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{categories.length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Target className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{scores.length}</p>
            <p className="text-xs text-muted-foreground">Metrics Tracked</p>
          </CardContent></Card>
        </div>

        {categories.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No benchmark data yet. Benchmarks will be generated as your business accumulates data.</CardContent></Card>
        ) : categories.map(cat => (
          <Card key={cat}>
            <CardContent className="py-4">
              <h3 className="font-semibold text-foreground mb-3 capitalize">{cat}</h3>
              <div className="space-y-3">
                {(byCategory[cat] ?? []).map(s => (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{s.metric_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-medium">{Number(s.business_value).toFixed(1)}</span>
                        <span className="text-muted-foreground">vs {Number(s.industry_avg).toFixed(1)} avg</span>
                        <Badge variant={s.percentile_rank! >= 75 ? "default" : s.percentile_rank! >= 50 ? "secondary" : "destructive"} className="text-xs">
                          P{s.percentile_rank}
                        </Badge>
                      </div>
                    </div>
                    <Progress value={s.percentile_rank ?? 50} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
};

export default Benchmarks;
