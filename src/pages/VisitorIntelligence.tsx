import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useVisitorProfiles,
  useVisitorEvents,
  useReengagementTasks,
  useScoreVisitors,
  useCompleteReengagement,
  classificationLabel,
  classificationColor,
  VisitorProfile,
} from "@/hooks/useVisitorIntelligence";
import {
  Users,
  Brain,
  RefreshCw,
  Eye,
  MessageSquare,
  Clock,
  CheckCircle2,
  Phone,
  Mail,
  Loader2,
  Activity,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

const VisitorIntelligence = () => {
  const { data: visitors, isLoading } = useVisitorProfiles();
  const { data: tasks } = useReengagementTasks();
  const scoreVisitors = useScoreVisitors();
  const completeTask = useCompleteReengagement();
  const [selectedVisitor, setSelectedVisitor] = useState<VisitorProfile | null>(null);

  const classificationCounts = (visitors ?? []).reduce((acc, v) => {
    acc[v.classification] = (acc[v.classification] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pendingTasks = (tasks ?? []).filter((t) => t.status === "pending");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Visitor Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered visitor scoring, timeline & re-engagement
            </p>
          </div>
          <Button
            onClick={() => scoreVisitors.mutate()}
            disabled={scoreVisitors.isPending}
          >
            {scoreVisitors.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Brain className="h-4 w-4 mr-2" />
            )}
            Score Visitors
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Curious", key: "curious_visitor", icon: Eye, color: "text-muted-foreground" },
            { label: "Interested", key: "interested_lead", icon: Activity, color: "text-blue-500" },
            { label: "Potential Buyer", key: "potential_buyer", icon: Target, color: "text-orange-500" },
            { label: "High-Value", key: "high_value_prospect", icon: TrendingUp, color: "text-destructive" },
            { label: "Promoter", key: "promoter", icon: Zap, color: "text-primary" },
          ].map(({ label, key, icon: Icon, color }) => (
            <Card key={key}>
              <CardContent className="flex items-center gap-3 pt-6">
                <Icon className={`h-5 w-5 ${color}`} />
                <div>
                  <p className="text-2xl font-bold text-foreground">{classificationCounts[key] ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="visitors">
          <TabsList>
            <TabsTrigger value="visitors">
              <Users className="h-4 w-4 mr-1" /> Visitors ({(visitors ?? []).length})
            </TabsTrigger>
            <TabsTrigger value="reengagement">
              <RefreshCw className="h-4 w-4 mr-1" /> Re-engagement ({pendingTasks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visitors">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Visitor Profiles</CardTitle>
                <CardDescription>AI-classified visitor intelligence with behavioral scoring</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (visitors ?? []).length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No visitor data yet</p>
                    <p className="text-xs text-muted-foreground">Visitors from chat, inbox, and web will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(visitors ?? []).map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedVisitor(v)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {(v.visitor_name ?? v.visitor_identifier).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {v.visitor_name ?? v.visitor_identifier}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {v.visitor_email ?? v.visitor_identifier}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{v.total_visits} visits · {v.total_conversations} chats</p>
                            <p>{v.last_visit_at ? format(new Date(v.last_visit_at), "MMM d, HH:mm") : "—"}</p>
                          </div>
                          <Badge variant={classificationColor(v.classification) as any}>
                            {classificationLabel(v.classification)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(Number(v.intent_score) * 100)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reengagement">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Re-engagement Tasks</CardTitle>
                <CardDescription>AI-suggested follow-ups for inactive or high-value visitors</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No pending re-engagement tasks</p>
                    <p className="text-xs text-muted-foreground">Run "Score Visitors" to generate suggestions</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingTasks.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-3">
                          {t.channel === "sms" ? (
                            <Phone className="h-4 w-4 text-primary" />
                          ) : t.channel === "email" ? (
                            <Mail className="h-4 w-4 text-primary" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-primary" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{t.task_type.replace(/_/g, " ")}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{t.suggested_message}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{t.channel}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => completeTask.mutate(t.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Done
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Visitor Timeline Dialog */}
        <VisitorTimelineDialog
          visitor={selectedVisitor}
          onClose={() => setSelectedVisitor(null)}
        />
      </div>
    </DashboardLayout>
  );
};

const VisitorTimelineDialog = ({
  visitor,
  onClose,
}: {
  visitor: VisitorProfile | null;
  onClose: () => void;
}) => {
  const { data: events, isLoading } = useVisitorEvents(visitor?.id ?? null);

  if (!visitor) return null;

  const eventIcon = (type: string) => {
    switch (type) {
      case "page_view": return <Eye className="h-3.5 w-3.5 text-blue-500" />;
      case "chat": return <MessageSquare className="h-3.5 w-3.5 text-primary" />;
      case "campaign_exposure": return <Target className="h-3.5 w-3.5 text-orange-500" />;
      case "crm_stage_change": return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
      case "call": return <Phone className="h-3.5 w-3.5 text-destructive" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={!!visitor} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
              {(visitor.visitor_name ?? visitor.visitor_identifier).charAt(0).toUpperCase()}
            </div>
            {visitor.visitor_name ?? visitor.visitor_identifier}
            <Badge variant={classificationColor(visitor.classification) as any}>
              {classificationLabel(visitor.classification)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted p-2">
            <p className="text-lg font-bold text-foreground">{visitor.total_visits}</p>
            <p className="text-xs text-muted-foreground">Visits</p>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <p className="text-lg font-bold text-foreground">{visitor.total_conversations}</p>
            <p className="text-xs text-muted-foreground">Chats</p>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <p className="text-lg font-bold text-foreground">{Math.round(Number(visitor.intent_score) * 100)}%</p>
            <p className="text-xs text-muted-foreground">Intent</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">Behavioral Timeline</h4>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No events recorded yet</p>
          ) : (
            <div className="space-y-0">
              {(events ?? []).map((e, i) => (
                <div key={e.id} className="flex gap-3 pb-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
                      {eventIcon(e.event_type)}
                    </div>
                    {i < (events ?? []).length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-medium text-foreground">{e.event_title ?? e.event_type}</p>
                    {e.event_description && (
                      <p className="text-xs text-muted-foreground">{e.event_description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(e.created_at), "MMM d, HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisitorIntelligence;
