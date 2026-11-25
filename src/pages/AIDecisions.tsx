import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAIDecisions } from "@/hooks/useAIDecisions";
import { Brain, CheckCircle2, XCircle, Zap, Clock } from "lucide-react";

// Each focus maps to the exact set of action_type values an edge function
// can write for that category. Filtering is an exact match on action_type —
// not a fuzzy text search — so a focus tab only ever shows suggestions of
// its own kind, never a shared/mixed list.
const FOCUS_CONFIG: Record<
  string,
  { title: string; description: string; actionTypes: string[] }
> = {
  posts: {
    title: "Suggested Posts",
    description: "AI-recommended content posts ready to publish.",
    actionTypes: ["suggest_post", "content_post"],
  },
  offers: {
    title: "Suggested Offers",
    description: "Pricing, bundle, and promotion ideas based on customer signals.",
    actionTypes: ["suggest_offer", "pricing_offer"],
  },
  replies: {
    title: "Suggested Replies",
    description: "Drafted responses to incoming conversations awaiting your approval.",
    actionTypes: ["suggest_reply", "inbox_reply"],
  },
  campaigns: {
    title: "Suggested Campaigns",
    description: "Campaign briefs the AI thinks are worth running next.",
    actionTypes: ["suggest_campaign", "broadcast_campaign"],
  },
  seo: {
    title: "SEO Opportunities",
    description: "Keyword, ranking, and content gaps the AI surfaced from your site signals.",
    actionTypes: ["seo_opportunity", "seo_keyword"],
  },
  competitors: {
    title: "Competitor Insights",
    description: "Plays inspired by what your competitors are doing right now.",
    actionTypes: ["competitor_insight", "competitor_play"],
  },
};

const matchesFocus = (item: any, focus: string | null) => {
  if (!focus || !FOCUS_CONFIG[focus]) return true;
  return FOCUS_CONFIG[focus].actionTypes.includes(item.action_type);
};

const AIDecisions = () => {
  const { actions, pending, executed, executeAction, dismissAction, isLoading } = useAIDecisions();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const focusConfig = focus ? FOCUS_CONFIG[focus] : null;

  const filteredActions = useMemo(
    () => actions.filter((a) => matchesFocus(a, focus)),
    [actions, focus],
  );
  const filteredPending = useMemo(
    () => pending.filter((a) => matchesFocus(a, focus)),
    [pending, focus],
  );
  const filteredExecuted = useMemo(
    () => executed.filter((a) => matchesFocus(a, focus)),
    [executed, focus],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {focusConfig?.title || "AI Business Advisor"}
          </h1>
          <p className="text-muted-foreground">
            {focusConfig?.description ||
              "AI-suggested operational actions with optional auto-execution."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{filteredPending.length}</p>
              <p className="text-xs text-muted-foreground">Pending Actions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle2 className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{filteredExecuted.length}</p>
              <p className="text-xs text-muted-foreground">Executed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Brain className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{filteredActions.length}</p>
              <p className="text-xs text-muted-foreground">Total Suggestions</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="executed">Executed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-3">
            {filteredPending.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {focus
                    ? `No pending ${focusConfig?.title.toLowerCase() || "suggestions"} yet.`
                    : "No pending AI suggestions. The system will generate new ones as signals are detected."}
                </CardContent>
              </Card>
            ) : (
              filteredPending.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Zap className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium text-foreground">{a.title}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{a.description}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{a.action_type}</Badge>
                            <Badge variant="secondary">{Number(a.confidence ?? 0).toFixed(0)}% confidence</Badge>
                            {a.impact_estimate && <Badge variant="secondary">{a.impact_estimate}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" onClick={() => executeAction.mutate(a.id)} disabled={executeAction.isPending}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Execute
                        </Button>
                        <Button aria-label="Close" size="sm" variant="ghost" onClick={() => dismissAction.mutate(a.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="executed" className="space-y-3">
            {filteredExecuted.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No executed actions yet.
                </CardContent>
              </Card>
            ) : (
              filteredExecuted.map((a) => (
                <Card key={a.id}>
                  <CardContent className="py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-foreground text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Executed {a.executed_at ? new Date(a.executed_at).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <Badge>{a.action_type}</Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {filteredActions.map((a) => (
              <Card key={a.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.action_type} · {a.source_signal}
                    </p>
                  </div>
                  <Badge
                    variant={
                      a.status === "executed"
                        ? "default"
                        : a.status === "dismissed"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {a.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AIDecisions;
