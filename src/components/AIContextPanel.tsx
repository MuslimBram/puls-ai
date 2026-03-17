import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Brain, RefreshCw, TrendingUp, TrendingDown, Minus, Lightbulb, Copy, MessageSquare, AlertTriangle } from "lucide-react";
import { useContactMemory, useRefreshMemory, useLeadScore } from "@/hooks/useAIConversationMemory";
import { toast } from "@/components/ui/sonner";

interface AIContextPanelProps {
  contactIdentifier?: string;
  contactName?: string;
  leadId?: string;
  channelType?: string;
  latestMessage?: string;
}

const SentimentIcon = ({ trend }: { trend: string | null }) => {
  if (trend === "positive") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (trend === "negative") return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
};

const sentimentLabel = (trend: string | null) => {
  if (trend === "positive") return "Positive";
  if (trend === "negative") return "Negative";
  if (trend === "mixed") return "Mixed";
  return "Neutral";
};

const sentimentVariant = (trend: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (trend === "positive") return "default";
  if (trend === "negative") return "destructive";
  return "secondary";
};

export const AIContextPanel = ({
  contactIdentifier,
  contactName,
  leadId,
  channelType,
  latestMessage,
}: AIContextPanelProps) => {
  const { data: memory, isLoading: memoryLoading } = useContactMemory(contactIdentifier);
  const { data: leadScore } = useLeadScore(leadId);
  const refreshMemory = useRefreshMemory();
  const [suggestedReply, setSuggestedReply] = useState<string | null>(null);
  const [dealSuggestion, setDealSuggestion] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!contactIdentifier) return;
    const result = await refreshMemory.mutateAsync({
      contactIdentifier,
      newMessage: latestMessage,
      channelType,
    });
    setSuggestedReply(result.suggested_reply || null);
    setDealSuggestion(result.deal_suggestion || null);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (!contactIdentifier) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          AI Intelligence — {contactName || contactIdentifier}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            onClick={handleRefresh}
            disabled={refreshMemory.isPending}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshMemory.isPending ? "animate-spin" : ""}`} />
            {refreshMemory.isPending ? "Analyzing..." : "Refresh"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score + Sentiment Row */}
        <div className="flex flex-wrap gap-3">
          {leadScore && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Lead Score</p>
                <p className="text-lg font-bold text-foreground">{leadScore.score}</p>
              </div>
            </div>
          )}
          {leadScore && typeof leadScore.churn_risk === "number" && leadScore.churn_risk > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">Churn Risk</p>
                <p className="text-lg font-bold text-destructive">{leadScore.churn_risk}%</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <SentimentIcon trend={memory?.sentiment_trend ?? null} />
            <div>
              <p className="text-xs text-muted-foreground">Sentiment</p>
              <Badge variant={sentimentVariant(memory?.sentiment_trend ?? null)} className="text-xs">
                {sentimentLabel(memory?.sentiment_trend ?? null)}
              </Badge>
            </div>
          </div>
          {memory?.interaction_count && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Interactions</p>
                <p className="text-lg font-bold text-foreground">{memory.interaction_count}</p>
              </div>
            </div>
          )}
        </div>

        {/* Memory Summary */}
        {memory?.summary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Relationship Summary</p>
            <p className="text-sm text-foreground rounded-lg bg-muted/50 p-3">{memory.summary}</p>
          </div>
        )}

        {/* Key Facts */}
        {memory?.key_facts && Array.isArray(memory.key_facts) && memory.key_facts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Key Facts</p>
            <div className="flex flex-wrap gap-1.5">
              {(memory.key_facts as string[]).map((fact, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {fact}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Score Factors */}
        {leadScore?.score_factors && typeof leadScore.score_factors === "object" && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Score Breakdown</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(leadScore.score_factors as Record<string, number>).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                  <span className="text-xs text-muted-foreground capitalize">{key}</span>
                  <span className="text-xs font-medium text-foreground">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Suggested Reply */}
        {suggestedReply && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Lightbulb className="h-3 w-3 text-primary" /> AI Suggested Reply
            </p>
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <p className="text-sm text-foreground">{suggestedReply}</p>
              <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs" onClick={() => copyText(suggestedReply)}>
                <Copy className="h-3 w-3 mr-1" /> Copy
              </Button>
            </div>
          </div>
        )}

        {/* Deal Suggestion */}
        {dealSuggestion && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">💼 Deal Insight</p>
            <p className="text-sm text-foreground rounded-lg bg-muted/50 p-2">{dealSuggestion}</p>
          </div>
        )}

        {/* Empty state */}
        {!memory && !memoryLoading && (
          <div className="text-center py-4">
            <Brain className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No AI memory for this contact yet.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={handleRefresh} disabled={refreshMemory.isPending}>
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshMemory.isPending ? "animate-spin" : ""}`} />
              Build Memory
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
