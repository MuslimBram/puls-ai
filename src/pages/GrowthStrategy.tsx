import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useGrowthStrategies, useCreateStrategy, useAdoptStrategy, useGrowthAnalytics } from "@/hooks/useGrowthStrategy";
import { TrendingUp, Plus, CheckCircle2, Target, Lightbulb, BarChart3, Loader2 } from "lucide-react";

const GrowthStrategy = () => {
  const { data: strategies } = useGrowthStrategies();
  const { data: analytics } = useGrowthAnalytics();
  const createStrategy = useCreateStrategy();
  const adoptStrategy = useAdoptStrategy();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    await createStrategy.mutateAsync({ title, summary: summary || undefined });
    setTitle("");
    setSummary("");
    setDialogOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Growth Strategy Engine</h1>
            <p className="text-sm text-muted-foreground">AI-generated growth plans with actionable steps and experiment tracking</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />New Strategy</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Growth Strategy</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input placeholder="Strategy title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Textarea placeholder="Summary (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
                <Button onClick={handleCreate} disabled={createStrategy.isPending} className="w-full">
                  {createStrategy.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Target className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.total ?? 0}</p><p className="text-xs text-muted-foreground">Strategies</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.adopted ?? 0}</p><p className="text-xs text-muted-foreground">Adopted</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">{analytics?.adoptionRate ?? 0}%</p><p className="text-xs text-muted-foreground">Adoption Rate</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Lightbulb className="h-8 w-8 text-yellow-500" /><div><p className="text-2xl font-bold">{analytics?.draft ?? 0}</p><p className="text-xs text-muted-foreground">Drafts</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="strategies">
          <TabsList>
            <TabsTrigger value="strategies">Strategies</TabsTrigger>
            <TabsTrigger value="experiments">Experiments</TabsTrigger>
          </TabsList>

          <TabsContent value="strategies" className="space-y-3">
            {(strategies || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No growth strategies yet. Create one above.</CardContent></Card>
            ) : (strategies || []).map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={s.status === "adopted" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge>
                      <Badge variant="outline" className="text-[10px]">{s.strategy_type}</Badge>
                    </div>
                    <p className="font-medium text-sm">{s.title}</p>
                    {s.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.summary}</p>}
                  </div>
                  {s.status === "draft" && (
                    <Button size="sm" onClick={() => adoptStrategy.mutate({ id: s.id, fields: { status: "adopted", adopted_at: new Date().toISOString(), updated_at: new Date().toISOString() } })} className="ml-4">
                      <CheckCircle2 className="mr-1 h-3 w-3" />Adopt
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="experiments">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lightbulb className="h-4 w-4" />Growth Experiments</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Experiments from adopted strategies will appear here for tracking A/B tests, new audiences, and content themes.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default GrowthStrategy;
