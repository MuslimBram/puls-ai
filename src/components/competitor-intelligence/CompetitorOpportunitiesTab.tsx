import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";
import type { Competitor } from "@/hooks/useCompetitors";

interface CompetitorOpportunitiesTabProps {
  competitors: Competitor[] | undefined;
}

export const CompetitorOpportunitiesTab = ({ competitors }: CompetitorOpportunitiesTabProps) => {
  const withOpps = competitors?.filter((c) => c.ai_opportunities?.length);

  if (!withOpps?.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        <Lightbulb className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Scan competitors to discover strategic opportunities.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {withOpps.map((comp) => (
        <Card key={comp.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="h-4 w-4 text-yellow-500" /> Opportunities vs {comp.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {comp.ai_opportunities.map((opp, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{opp.opportunity}</p>
                <p className="mt-1 text-xs text-muted-foreground">{opp.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
