import { useState, DragEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Deal } from "@/hooks/useCRM";
import { Plus, GripVertical } from "lucide-react";
import { formatALL } from "@/lib/currency";

interface PipelineBoardProps {
  stages: any[];
  deals: Deal[];
  isLoading: boolean;
  onNewDeal: () => void;
  onSelectDeal: (deal: Deal) => void;
  onMoveDeal?: (deal: Deal, stageId: string) => void;
}

export const PipelineBoard = ({ stages, deals, isLoading, onNewDeal, onSelectDeal, onMoveDeal }: PipelineBoardProps) => {
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);

  const handleDragStart = (e: DragEvent, deal: Deal) => {
    setDraggedDealId(deal.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", deal.id);
  };

  const handleDragOver = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetStage(stageId);
  };

  const handleDragLeave = () => {
    setDropTargetStage(null);
  };

  const handleDrop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    setDropTargetStage(null);
    const dealId = e.dataTransfer.getData("text/plain");
    const deal = deals.find((d) => d.id === dealId);
    if (deal && deal.stage_id !== stageId && onMoveDeal) {
      onMoveDeal(deal, stageId);
    }
    setDraggedDealId(null);
  };

  const handleDragEnd = () => {
    setDraggedDealId(null);
    setDropTargetStage(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Plus className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No Pipeline Stages</h3>
        <p className="text-sm text-muted-foreground mb-4">Pipeline stages are being initialized...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Sales Pipeline</h3>
        <Button size="sm" onClick={onNewDeal}>
          <Plus className="h-4 w-4 mr-1" /> New Deal
        </Button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage_id === stage.id);
          const stageValue = stageDeals.reduce((s, d) => s + (d.deal_value || 0), 0);
          const isDropTarget = dropTargetStage === stage.id;

          return (
            <div
              key={stage.id}
              className={`min-w-[260px] max-w-[280px] flex-shrink-0 rounded-lg transition-all ${
                isDropTarget ? "ring-2 ring-primary bg-primary/5" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div
                className="mb-2 flex items-center justify-between rounded-lg p-2"
                style={{ backgroundColor: stage.color + "15" }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium text-foreground">{stage.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {stageDeals.length}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">{formatALL(stageValue)}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {stageDeals.length === 0 && (
                  <div className="flex items-center justify-center h-20 border-2 border-dashed border-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Drop deals here</p>
                  </div>
                )}
                {stageDeals.map((deal) => (
                  <Card
                    key={deal.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, deal)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all ${
                      draggedDealId === deal.id ? "opacity-40 scale-95" : ""
                    }`}
                    onClick={() => onSelectDeal(deal)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                            <Badge
                              variant={deal.priority === "high" ? "destructive" : deal.priority === "low" ? "secondary" : "outline"}
                              className="text-[10px] ml-1 shrink-0"
                            >
                              {deal.priority}
                            </Badge>
                          </div>
                          {deal.contact_name && (
                            <p className="text-xs text-muted-foreground mt-1">{deal.contact_name}</p>
                          )}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground">
                              {formatALL((deal.deal_value || 0))}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {deal.source_channel}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
