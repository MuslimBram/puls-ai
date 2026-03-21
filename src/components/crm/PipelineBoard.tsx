import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Deal } from "@/hooks/useCRM";
import { Plus } from "lucide-react";

interface PipelineBoardProps {
  stages: any[];
  deals: Deal[];
  isLoading: boolean;
  onNewDeal: () => void;
  onSelectDeal: (deal: Deal) => void;
}

export const PipelineBoard = ({ stages, deals, isLoading, onNewDeal, onSelectDeal }: PipelineBoardProps) => (
  <>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold text-foreground">Sales Pipeline</h3>
      <Button size="sm" onClick={onNewDeal}>
        <Plus className="h-4 w-4 mr-1" /> New Deal
      </Button>
    </div>
    {isLoading ? (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    ) : (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage_id === stage.id);
          const stageValue = stageDeals.reduce((s, d) => s + (d.deal_value || 0), 0);
          return (
            <div key={stage.id} className="min-w-[260px] max-w-[280px] flex-shrink-0">
              <div className="mb-2 flex items-center justify-between rounded-lg p-2" style={{ backgroundColor: stage.color + "15" }}>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-foreground">{stage.name}</span>
                  <Badge variant="secondary" className="text-xs">{stageDeals.length}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">${stageValue.toLocaleString()}</span>
              </div>
              <div className="space-y-2">
                {stageDeals.map((deal) => (
                  <Card key={deal.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelectDeal(deal)}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                        <Badge variant={deal.priority === "high" ? "destructive" : deal.priority === "low" ? "secondary" : "outline"} className="text-[10px] ml-1 shrink-0">
                          {deal.priority}
                        </Badge>
                      </div>
                      {deal.contact_name && <p className="text-xs text-muted-foreground mt-1">{deal.contact_name}</p>}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">${(deal.deal_value || 0).toLocaleString()}</span>
                        <Badge variant="outline" className="text-[10px]">{deal.source_channel}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>
);
