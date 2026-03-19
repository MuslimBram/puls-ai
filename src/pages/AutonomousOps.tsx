import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAutonomousTasks, useRespondToTask, useAutomationSuggestions, useAdoptSuggestion, useOperationalSignals, useOpsAnalytics } from "@/hooks/useAutonomousOps";
import { Brain, CheckCircle2, XCircle, Zap, Bell, TrendingUp, AlertTriangle } from "lucide-react";

const priorityColor: Record<string, string> = { high: "text-destructive", medium: "text-yellow-500", low: "text-muted-foreground" };
const severityVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = { critical: "destructive", warning: "default", info: "secondary" };

const AutonomousOps = () => {
  const { data: tasks } = useAutonomousTasks();
  const { data: suggestions } = useAutomationSuggestions();
  const { data: signals } = useOperationalSignals();
  const { data: analytics } = useOpsAnalytics();
  const respondTask = useRespondToTask();
  const adoptSuggestion = useAdoptSuggestion();

  const pendingTasks = (tasks || []).filter((t) => t.status === "suggested");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Autonomous Business OS</h1>
          <p className="text-sm text-muted-foreground">AI-driven operational intelligence and task automation</p>
        </div>

        {/* Analytics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Brain className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.totalSuggestions ?? 0}</p><p className="text-xs text-muted-foreground">AI Suggestions</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.adoptionRate ?? 0}%</p><p className="text-xs text-muted-foreground">Adoption Rate</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{analytics?.completionRate ?? 0}%</p><p className="text-xs text-muted-foreground">Completion Rate</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><XCircle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold">{analytics?.dismissRate ?? 0}%</p><p className="text-xs text-muted-foreground">Dismiss Rate</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">AI Tasks ({pendingTasks.length})</TabsTrigger>
            <TabsTrigger value="automations">Automation Ideas ({suggestions?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="signals">Signals ({signals?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-3">
            {pendingTasks.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending AI task suggestions</CardContent></Card>
            ) : pendingTasks.map((task) => (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">{task.task_type}</Badge>
                      <span className={`text-xs font-medium ${priorityColor[task.priority] || ""}`}>{task.priority}</span>
                      <span className="text-xs text-muted-foreground">{Math.round(task.ai_confidence * 100)}% confidence</span>
                    </div>
                    <p className="font-medium text-sm">{task.title}</p>
                    {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => respondTask.mutate({ taskId: task.id, action: "dismiss" })}><XCircle className="h-4 w-4" /></Button>
                    <Button size="sm" onClick={() => respondTask.mutate({ taskId: task.id, action: "accept" })}><CheckCircle2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="automations" className="space-y-3">
            {(suggestions || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No automation suggestions yet</CardContent></Card>
            ) : (suggestions || []).map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{s.title}</p>
                    {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                    <span className="text-xs text-muted-foreground">{Math.round(s.confidence * 100)}% confidence</span>
                  </div>
                  <Button size="sm" onClick={() => adoptSuggestion.mutate(s.id)}><Zap className="mr-1 h-3 w-3" />Adopt</Button>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="signals" className="space-y-3">
            {(signals || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No operational signals yet</CardContent></Card>
            ) : (signals || []).map((sig) => (
              <Card key={sig.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  {sig.severity === "critical" ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Bell className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{sig.title}</p>
                      <Badge variant={severityVariant[sig.severity] || "outline"} className="text-[10px]">{sig.severity}</Badge>
                    </div>
                    {sig.description && <p className="text-xs text-muted-foreground">{sig.description}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(sig.created_at).toLocaleDateString()}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AutonomousOps;
