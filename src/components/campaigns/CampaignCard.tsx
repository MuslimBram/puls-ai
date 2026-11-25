import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Campaign } from "@/hooks/useCampaigns";
import { STATUS_COLORS } from "./constants";
import { Megaphone, Sparkles, Trash2, Eye, Send } from "lucide-react";

interface CampaignCardProps {
  campaign: Campaign;
  onView: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onLaunch?: () => void;
  isRegenerating: boolean;
  isLaunching?: boolean;
}

export const CampaignCard = ({ campaign, onView, onDelete, onRegenerate, onLaunch, isRegenerating, isLaunching }: CampaignCardProps) => (
  <Card className="hover:border-primary/20 transition-colors">
    <CardContent className="flex items-center justify-between py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Megaphone className="h-4 w-4 text-primary shrink-0" />
          <h3 className="font-medium text-foreground truncate">{campaign.name}</h3>
          <Badge className={STATUS_COLORS[campaign.status] || ""}>{campaign.status.replace("_", " ")}</Badge>
          {campaign.ai_generated && <Badge variant="secondary" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="capitalize">{campaign.objective.replace("_", " ")}</span>
          {campaign.preferred_channels?.length > 0 && (
            <span>{campaign.preferred_channels.join(", ")}</span>
          )}
          {campaign.budget_max > 0 && <span>${campaign.budget_min}–${campaign.budget_max}</span>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button aria-label="Show" size="sm" variant="ghost" onClick={onView}><Eye className="h-4 w-4" /></Button>
        {campaign.status === "draft" && (
          <Button aria-label="Generate with AI" size="sm" variant="ghost" onClick={onRegenerate} disabled={isRegenerating}>
            <Sparkles className="h-4 w-4" />
          </Button>
        )}
        {onLaunch && ["strategy_ready", "draft"].includes(campaign.status) && (
          <Button size="sm" variant="default" onClick={onLaunch} disabled={isLaunching} title="Launch as broadcast">
            <Send className="h-4 w-4 mr-1" /> Launch
          </Button>
        )}
        <Button aria-label="Delete" size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </CardContent>
  </Card>
);
