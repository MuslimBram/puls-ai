import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAIDecisions } from "@/hooks/useAIDecisions";
import { Brain, CheckCircle2, XCircle, Zap, Clock } from "lucide-react";

const AIDecisions = () => {
  const { actions, pending, executed, executeAction, dismissAction, isLoading } = useAIDecisions();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Decision Automation</h1>
          <p className="text-muted-foreground">AI-suggested operational actions with optional auto-execution.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent className="pt-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{pending.length}</p>
            <p className="text-xs text-muted-foreground">Pending Actions</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{executed.length}</p>
            <p className="text-xs text-muted-foreground">Executed</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <Brain className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{actions.length}</p>
            <p className="text-xs text-muted-foreground">Total Suggestions</p>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="pending">
          <TabsList><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="executed">Executed</TabsTrigger><TabsTrigger value="all">All</TabsTrigger></TabsList>

          <TabsContent value="pending" className="space-y-3">
            {pending.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No pending AI suggestions. The system will generate new ones as signals are detected.</CardContent></Card>
            ) : pending.map(a => (
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
                      <Button size="sm" variant="ghost" onClick={() => dismissAction.mutate(a.id)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="executed" className="space-y-3">
            {executed.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No executed actions yet.</CardContent></Card>
            ) : executed.map(a => (
              <Card key={a.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-foreground text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">Executed {a.executed_at ? new Date(a.executed_at).toLocaleDateString() : ""}</p>
                  </div>
                  <Badge>{a.action_type}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="all" className="space-y-3">
            {actions.map(a => (
              <Card key={a.id}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.action_type} · {a.source_signal}</p>
                  </div>
                  <Badge variant={a.status === "executed" ? "default" : a.status === "dismissed" ? "secondary" : "outline"}>{a.status}</Badge>
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
