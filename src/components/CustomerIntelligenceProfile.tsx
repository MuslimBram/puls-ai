import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock3, MessageSquare, Phone, Signal, Sparkles, Target, TrendingUp, Wallet } from "lucide-react";
import { useCustomerIntelligence } from "@/hooks/useCustomerIntelligence";

interface CustomerIntelligenceProfileProps {
  contactIdentifier?: string | null;
  contactName?: string | null;
}

const engagementVariant = (status: "active" | "warming" | "cold") => {
  if (status === "active") return "default" as const;
  if (status === "warming") return "secondary" as const;
  return "outline" as const;
};

export const CustomerIntelligenceProfile = ({
  contactIdentifier,
  contactName,
}: CustomerIntelligenceProfileProps) => {
  const { data, isLoading } = useCustomerIntelligence(contactIdentifier, contactName);

  if (!contactIdentifier) return null;

  return (
    <Card className="border-primary/10 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              Customer Intelligence Profile
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Behavioral snapshot, buying signals, and relationship context for this contact.
            </p>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={engagementVariant(data.engagementStatus)} className="text-xs capitalize">
                {data.engagementStatus}
              </Badge>
              {data.preferredChannel && (
                <Badge variant="secondary" className="text-xs">
                  {data.preferredChannel}
                </Badge>
              )}
              {data.sentimentTrend && (
                <Badge variant="outline" className="text-xs capitalize">
                  {data.sentimentTrend}
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Building customer profile...</p>
        ) : !data || data.totalInteractions === 0 ? (
          <p className="text-sm text-muted-foreground">No relationship data found for this contact yet.</p>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card/80 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{data.displayName || contactName || contactIdentifier}</p>
                  <p className="text-xs text-muted-foreground">{data.identifier}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {data.lastSeen ? `Last seen ${formatDistanceToNow(new Date(data.lastSeen), { addSuffix: true })}` : "No recent activity"}
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{data.summary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-card/80 p-3">
                <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">Interactions</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{data.totalInteractions}</p>
                <p className="text-xs text-muted-foreground">{data.totalMessages} messages · {data.totalCalls} calls</p>
              </div>
              <div className="rounded-xl border border-border bg-card/80 p-3">
                <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4" />
                  <span className="text-xs">Lead Quality</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{data.avgAiScore || data.avgIntentScore || 0}</p>
                <p className="text-xs text-muted-foreground">AI {data.avgAiScore}% · Intent {data.avgIntentScore}%</p>
              </div>
              <div className="rounded-xl border border-border bg-card/80 p-3">
                <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs">Revenue Signal</span>
                </div>
                <p className="text-xl font-semibold text-foreground">${data.predictedValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{data.openDeals} open deals · ${data.totalDealValue.toLocaleString()} total deal value</p>
              </div>
              <div className="rounded-xl border border-border bg-card/80 p-3">
                <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                  <Signal className="h-4 w-4" />
                  <span className="text-xs">Engagement</span>
                </div>
                <p className="text-xl font-semibold capitalize text-foreground">{data.engagementStatus}</p>
                <p className="text-xs text-muted-foreground">{data.cadenceLabel}{data.churnRisk > 0 ? ` · Churn ${data.churnRisk}%` : ""}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card/80 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Next Best Actions</p>
                </div>
                {data.nextBestActions.length > 0 ? (
                  <div className="space-y-2">
                    {data.nextBestActions.map((action) => (
                      <div key={action} className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                        {action}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No immediate action recommended.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-card/80 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Signals</p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Top keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {data.topKeywords.length > 0 ? data.topKeywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary" className="text-xs">{keyword}</Badge>
                    )) : <span className="text-sm text-muted-foreground">No keyword pattern yet.</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {data.tags.length > 0 ? data.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    )) : <span className="text-sm text-muted-foreground">No tags yet.</span>}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/60 p-3">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span className="text-xs">First seen</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {data.firstSeen ? formatDistanceToNow(new Date(data.firstSeen), { addSuffix: true }) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-3">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="text-xs">Relationship depth</span>
                    </div>
                    <p className="text-sm font-medium capitalize text-foreground">{data.cadenceLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
