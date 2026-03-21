import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  useConversationNotes,
  THREAD_STATUSES,
  PRIORITY_LEVELS,
  type ConversationThread,
} from "@/hooks/useHelpdesk";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, StickyNote, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

interface ThreadDetailDialogProps {
  thread: ConversationThread;
  onClose: () => void;
  onUpdate: (updates: Partial<ConversationThread>) => void;
}

export const ThreadDetailDialog = ({ thread, onClose, onUpdate }: ThreadDetailDialogProps) => {
  const { notes, addNote } = useConversationNotes(thread.id);
  const [noteText, setNoteText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const generateSummary = async () => {
    setAiLoading(true);
    try {
      const { data } = await supabase.functions.invoke("ai-sales-assistant", {
        body: {
          prompt: `Summarize this support conversation in 2-3 sentences. Contact: ${thread.contact_name || "Unknown"}. Channel: ${thread.channel_type}. Status: ${thread.status}. Message count: ${thread.message_count}. Tags: ${thread.tags?.join(", ") || "none"}.`,
        },
      });
      if (data?.result) {
        onUpdate({ ai_summary: data.result });
        toast.success("AI summary generated");
      }
    } catch {
      toast.error("Failed to generate summary");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            {thread.subject || thread.contact_name || "Conversation"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
            <TabsTrigger value="ai">AI Tools</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={thread.status} onValueChange={(v) => onUpdate({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {THREAD_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={thread.priority} onValueChange={(v) => onUpdate({ priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Contact</p>
                <p className="text-foreground">{thread.contact_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Channel</p>
                <p className="text-foreground">{thread.channel_type}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Messages</p>
                <p className="text-foreground">{thread.message_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-foreground">{format(new Date(thread.created_at), "PPp")}</p>
              </div>
            </div>

            {thread.sla_response_due && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">SLA Response Due</p>
                <p className={`text-sm font-medium ${new Date(thread.sla_response_due) < new Date() && !thread.first_response_at ? "text-destructive" : "text-foreground"}`}>
                  {format(new Date(thread.sla_response_due), "PPp")}
                  {thread.first_response_at && <span className="text-green-600 ml-2">(Responded)</span>}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={thread.is_auto_reply_enabled}
                onCheckedChange={(v) => onUpdate({ is_auto_reply_enabled: v })}
              />
              <Label className="text-sm">AI Auto-reply enabled</Label>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="space-y-3">
            <div className="flex gap-2">
              <Textarea
                placeholder="Add internal note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button
                size="sm"
                disabled={!noteText.trim()}
                onClick={() => {
                  addNote.mutate({ content: noteText });
                  setNoteText("");
                }}
              >
                <StickyNote className="h-4 w-4" />
              </Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {note.is_ai_generated && <Badge variant="secondary" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>}
                    <span className="text-xs text-muted-foreground">{format(new Date(note.created_at), "PPp")}</span>
                  </div>
                  <p className="text-sm text-foreground">{note.content}</p>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="ai" className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <Button onClick={generateSummary} disabled={aiLoading} variant="outline" className="w-full">
                  {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Generate AI Summary
                </Button>
                {thread.ai_summary && (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1">AI Summary</p>
                    <p className="text-sm text-foreground">{thread.ai_summary}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
