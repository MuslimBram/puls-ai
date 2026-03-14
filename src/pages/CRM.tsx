import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { usePipelineStages, useDeals, useDealNotes, useDealTasks, useDealActivities, usePipelineStats, useAllTasks, Deal } from "@/hooks/useCRM";
import { supabase } from "@/integrations/supabase/client";
import { crmFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { Plus, Trash2, Bot, GripVertical, StickyNote, CheckSquare, BarChart3, DollarSign, Target, TrendingUp, Calendar, ChevronRight } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

const CRM = () => {
  const { stages, isLoading: stagesLoading, initStages } = usePipelineStages();
  const { deals, isLoading: dealsLoading, addDeal, updateDeal, deleteDeal } = useDeals();
  const stats = usePipelineStats();
  const allTasksQuery = useAllTasks();
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [newDeal, setNewDeal] = useState({ title: "", contact_name: "", contact_email: "", deal_value: 0, priority: "medium", source_channel: "manual" });
  const [aiLoading, setAiLoading] = useState(false);

  // Auto-init default stages
  useEffect(() => {
    if (!stagesLoading && stages.length === 0) {
      initStages.mutate();
    }
  }, [stagesLoading, stages.length]);

  const handleAddDeal = () => {
    if (!newDeal.title.trim()) return;
    const firstStage = stages[0];
    addDeal.mutate({ ...newDeal, stage_id: firstStage?.id || null } as any, {
      onSuccess: () => {
        setShowNewDeal(false);
        setNewDeal({ title: "", contact_name: "", contact_email: "", deal_value: 0, priority: "medium", source_channel: "manual" });
      },
    });
  };

  const moveDeal = (deal: Deal, stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    const updates: any = { id: deal.id, stage_id: stageId };
    if (stage?.name === "Won") updates.won_at = new Date().toISOString();
    if (stage?.name === "Lost") updates.lost_at = new Date().toISOString();
    updateDeal.mutate(updates);
  };

  const isLoading = stagesLoading || dealsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2"><Target className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalDeals}</p>
                <p className="text-xs text-muted-foreground">Total Deals</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2"><DollarSign className="h-5 w-5 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">${stats.totalValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Pipeline Value</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-500/10 p-2"><TrendingUp className="h-5 w-5 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.winRate}%</p>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-500/10 p-2"><CheckSquare className="h-5 w-5 text-amber-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{allTasksQuery.data?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* Pipeline View */}
          <TabsContent value="pipeline">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Sales Pipeline</h3>
              <Button size="sm" onClick={() => setShowNewDeal(true)}>
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
                          <Card key={deal.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedDeal(deal)}>
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
          </TabsContent>

          {/* Tasks */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Open Tasks</CardTitle>
                <CardDescription>Follow-ups and reminders across all deals.</CardDescription>
              </CardHeader>
              <CardContent>
                {(allTasksQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No open tasks.</p>
                ) : (
                  <div className="space-y-2">
                    {(allTasksQuery.data ?? []).map((task: any) => (
                      <div key={task.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{task.title}</p>
                          <p className="text-xs text-muted-foreground">{task.deals?.title || "No deal"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.due_date && (
                            <Badge variant={new Date(task.due_date) < new Date() ? "destructive" : "outline"} className="text-xs">
                              {format(new Date(task.due_date), "MMM d")}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">{task.priority}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pipeline Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.stageStats.map((s) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-foreground w-32 truncate">{s.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${stats.totalDeals > 0 ? (s.count / stats.totalDeals) * 100 : 0}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{s.count}</span>
                      <span className="text-xs font-medium text-foreground w-20 text-right">${s.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-border">
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-500">{stats.wonDeals}</p>
                    <p className="text-xs text-muted-foreground">Won</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-red-500">{stats.lostDeals}</p>
                    <p className="text-xs text-muted-foreground">Lost</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-foreground">{stats.winRate}%</p>
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New Deal Dialog */}
        <Dialog open={showNewDeal} onOpenChange={setShowNewDeal}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Deal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <FieldLabelWithGuide label="Title *" guide={getFieldGuide(crmFieldGuides, "deal_title")!} />
                <Input value={newDeal.title} onChange={(e) => setNewDeal((f) => ({ ...f, title: e.target.value }))} placeholder="Deal title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabelWithGuide label="Contact Name" guide={getFieldGuide(crmFieldGuides, "deal_contact_name")!} />
                  <Input value={newDeal.contact_name} onChange={(e) => setNewDeal((f) => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <Input value={newDeal.contact_email} onChange={(e) => setNewDeal((f) => ({ ...f, contact_email: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabelWithGuide label="Value ($)" guide={getFieldGuide(crmFieldGuides, "deal_value")!} />
                  <Input type="number" value={newDeal.deal_value} onChange={(e) => setNewDeal((f) => ({ ...f, deal_value: Number(e.target.value) }))} />
                </div>
                <div>
                  <FieldLabelWithGuide label="Priority" guide={getFieldGuide(crmFieldGuides, "deal_priority")!} />
                  <Select value={newDeal.priority} onValueChange={(v) => setNewDeal((f) => ({ ...f, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Source</label>
                <Select value={newDeal.source_channel} onValueChange={(v) => setNewDeal((f) => ({ ...f, source_channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="website_chat">Website Chat</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewDeal(false)}>Cancel</Button>
              <Button onClick={handleAddDeal} disabled={addDeal.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Deal Detail Dialog */}
        {selectedDeal && (
          <DealDetailDialog
            deal={selectedDeal}
            stages={stages}
            onClose={() => setSelectedDeal(null)}
            onMove={moveDeal}
            onUpdate={(updates) => updateDeal.mutate({ id: selectedDeal.id, ...updates })}
            onDelete={() => {
              deleteDeal.mutate(selectedDeal.id);
              setSelectedDeal(null);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

// Deal detail dialog component
function DealDetailDialog({
  deal,
  stages,
  onClose,
  onMove,
  onUpdate,
  onDelete,
}: {
  deal: Deal;
  stages: any[];
  onClose: () => void;
  onMove: (deal: Deal, stageId: string) => void;
  onUpdate: (updates: Partial<Deal>) => void;
  onDelete: () => void;
}) {
  const { notes, addNote } = useDealNotes(deal.id);
  const { tasks, addTask, toggleTask } = useDealTasks(deal.id);
  const { activities } = useDealActivities(deal.id);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const runAI = async (action: string) => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-sales-assistant", {
        body: { deal, notes, action },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      addNote.mutate({ content: `🤖 AI (${action}): ${data.result}`, is_ai_generated: true });
      toast.success("AI insight added to notes");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const currentStage = stages.find((s) => s.id === deal.stage_id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {deal.title}
            <Badge variant="outline" className="text-xs">{currentStage?.name || "Unassigned"}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Contact:</span>{" "}
            <span className="text-foreground">{deal.contact_name || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="text-foreground">{deal.contact_email || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Value:</span>{" "}
            <span className="text-foreground font-medium">${(deal.deal_value || 0).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Source:</span>{" "}
            <Badge variant="secondary" className="text-xs">{deal.source_channel}</Badge>
          </div>
        </div>

        {/* Move Stage */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Move to:</span>
          {stages.map((s) => (
            <Button
              key={s.id}
              variant={s.id === deal.stage_id ? "default" : "outline"}
              size="sm"
              className="text-xs h-7"
              onClick={() => onMove(deal, s.id)}
            >
              {s.name}
            </Button>
          ))}
        </div>

        <Tabs defaultValue="notes">
          <TabsList className="h-8">
            <TabsTrigger value="notes" className="text-xs">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs">Tasks ({tasks.length})</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs">AI Assistant</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Input placeholder="Add a note..." value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && noteText.trim()) {
                  addNote.mutate({ content: noteText });
                  setNoteText("");
                }
              }} />
              <Button size="sm" onClick={() => { if (noteText.trim()) { addNote.mutate({ content: noteText }); setNoteText(""); } }}>Add</Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg border border-border p-2">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {n.is_ai_generated && "🤖 "}{format(new Date(n.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-3 mt-3">
            <div className="flex gap-2">
              <Input placeholder="New task..." value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && taskTitle.trim()) {
                  addTask.mutate({ title: taskTitle });
                  setTaskTitle("");
                }
              }} />
              <Button size="sm" onClick={() => { if (taskTitle.trim()) { addTask.mutate({ title: taskTitle }); setTaskTitle(""); } }}>Add</Button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <Checkbox
                    checked={t.is_completed}
                    onCheckedChange={(checked) => toggleTask.mutate({ id: t.id, is_completed: !!checked })}
                  />
                  <span className={`text-sm flex-1 ${t.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</span>
                  {t.due_date && (
                    <Badge variant={new Date(t.due_date) < new Date() && !t.is_completed ? "destructive" : "outline"} className="text-[10px]">
                      {format(new Date(t.due_date), "MMM d")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">Use AI to assist with this deal:</p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" size="sm" disabled={aiLoading} onClick={() => runAI("suggest_followup")}>
                <Bot className="h-4 w-4 mr-2" /> Suggest Follow-up Message
              </Button>
              <Button variant="outline" size="sm" disabled={aiLoading} onClick={() => runAI("summarize")}>
                <Bot className="h-4 w-4 mr-2" /> Summarize Deal Status
              </Button>
              <Button variant="outline" size="sm" disabled={aiLoading} onClick={() => runAI("recommend")}>
                <Bot className="h-4 w-4 mr-2" /> Get Recommendations
              </Button>
            </div>
            {aiLoading && <p className="text-xs text-muted-foreground animate-pulse">AI is thinking...</p>}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete Deal
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CRM;
