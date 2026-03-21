import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, BarChart3 } from "lucide-react";

interface SuggestedKeyword {
  id: string;
  trend_value: string;
}

interface CompetitorSuggestionsTabProps {
  suggestedKeywords: SuggestedKeyword[];
}

export const CompetitorSuggestionsTab = ({ suggestedKeywords }: CompetitorSuggestionsTabProps) => (
  <div className="space-y-4">
    {suggestedKeywords.length > 0 && (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4 text-primary" /> Suggested Keywords to Target
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {suggestedKeywords.map((kw) => (
              <Badge key={kw.id} variant="outline" className="text-xs">{kw.trend_value}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            These keywords are based on gaps identified in competitor analysis. Add them to your keyword monitoring to capture leads.
          </p>
        </CardContent>
      </Card>
    )}

    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-primary" /> How Insights Feed Your Strategy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">📅 Content Calendar</p>
          <p className="mt-1 text-xs text-muted-foreground">Competitor themes and trends can shape what your AI content engine prioritizes next.</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">🎯 Campaign Builder</p>
          <p className="mt-1 text-xs text-muted-foreground">Positioning gaps and new promotions expose angles your campaigns can exploit immediately.</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium text-foreground">🔍 Lead Keywords</p>
          <p className="mt-1 text-xs text-muted-foreground">Suggested keywords from competitor gaps can be reused in lead discovery and search monitoring.</p>
        </div>
      </CardContent>
    </Card>
  </div>
);
