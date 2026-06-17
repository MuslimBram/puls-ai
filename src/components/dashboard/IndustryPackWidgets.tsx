import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIndustryPacks } from "@/hooks/useIndustryPacks";
import { Briefcase, TrendingUp } from "lucide-react";

/**
 * Renders KPI widget placeholders for every installed industry pack.
 * Each pack ships a list of widget descriptors (key/title/metric).
 * Metric values resolve through the install_log + downstream tables;
 * until a pack has wired its live aggregator we render the widget chrome
 * with a "—" placeholder so users see what the pack provides.
 */
export function IndustryPackWidgets() {
  const { installed } = useIndustryPacks();

  if (!installed.length) return null;

  return (
    <div className="space-y-4">
      {installed.map((inst) => {
        const pack = inst.industry_packs;
        const widgets =
          (pack?.contents?.widgets as { key: string; title: string; metric: string }[] | undefined) ?? [];
        if (!pack || !widgets.length) return null;

        return (
          <div key={inst.id}>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Briefcase className="h-4 w-4 text-primary" />
              {pack.name}
              <Badge variant="secondary" className="text-[10px]">Industry Pack</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {widgets.map((w) => (
                <Card key={w.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground font-medium">
                      {w.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold flex items-baseline gap-2">
                      —
                      <TrendingUp className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate" title={w.metric}>
                      {w.metric}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
