import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Deal, useDealNotes, useDealTasks, useDealActivities } from "@/hooks/useCRM";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { Trash2, Bot } from "lucide-react";

interface DealDetailDialogProps {
  deal: Deal;
  stages: any[];
  onClose: () => void;
  onMove: (deal: Deal, stageId: string) => void;
  onUpdate: (updates: Partial<Deal>) => void;
  onDelete: () => void;
}

export function DealDetailDialog({ deal, stages, onClose, onMove, onUpdate, onDelete }: DealDetailDialogProps) {
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
