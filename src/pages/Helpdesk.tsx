import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  useConversationThreads,
  useConversationNotes,
  useHelpdeskStats,
  THREAD_STATUSES,
  PRIORITY_LEVELS,
  type HelpdeskFilters,
  type ConversationThread,
} from "@/hooks/useHelpdesk";
import { supabase } from "@/integrations/supabase/client";
import {
  Headphones,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  MessageSquare,
  StickyNote,
  Sparkles,
  Loader2,
  UserPlus,
  Timer,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "@/components/ui/sonner";

const Helpdesk = () => {
  const [filters, setFilters] = useState<HelpdeskFilters>({});
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { threads, total, isLoading, createThread, updateThread, page, pageSize, nextPage, prevPage, setPage } =
    useConversationThreads(filters);
  const { data: stats } = useHelpdeskStats();
  const totalPages = Math.ceil(total / pageSize);

  const handleFilterChange = (fn: (f: HelpdeskFilters) => HelpdeskFilters) => {
    setPage(0);
    setFilters(fn);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Stats Row */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Headphones className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stats?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Conversations</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stats?.overdue ?? 0}</p>
                <p className="text-xs text-muted-foreground">SLA Overdue</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Timer className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stats?.avgResponseTime ?? 0}m</p>
                <p className="text-xs text-muted-foreground">Avg Response</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10">
                <Clock className="h-4 w-4 text-yellow-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {stats?.byStatus?.find((s) => s.value === "in_progress")?.count ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 pb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="w-48"
              value={filters.search ?? ""}
              onChange={(e) => handleFilterChange((f) => ({ ...f, search: e.target.value || undefined }))}
            />
            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) => handleFilterChange((f) => ({ ...f, status: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {THREAD_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.priority ?? "all"}
              onValueChange={(v) => handleFilterChange((f) => ({ ...f, priority: v === "all" ? undefined : v }))}
            >
              <SelectTrigger className="w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                {PRIORITY_LEVELS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => { setPage(0); setFilters({}); }}>Clear</Button>
            <Button size="sm" className="ml-auto" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </CardContent>
        </Card>

        {/* Thread List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Headphones className="h-5 w-5 text-primary" />
              Conversations ({total})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : threads.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No conversations yet. They will appear here as messages come in.
              </p>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => {
                  const statusInfo = THREAD_STATUSES.find((s) => s.value === thread.status);
                  const priorityInfo = PRIORITY_LEVELS.find((p) => p.value === thread.priority);
                  const isOverdue = thread.sla_response_due && new Date(thread.sla_response_due) < new Date() && !thread.first_response_at;

                  return (
                    <div
                      key={thread.id}
                      className={`flex items-start justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${isOverdue ? "border-destructive/30 bg-destructive/5" : "border-border"}`}
                      onClick={() => setSelectedThread(thread)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-foreground truncate">
                            {thread.subject || thread.contact_name || "Unnamed conversation"}
                          </span>
                          <Badge className={`text-xs ${statusInfo?.color ?? ""}`}>{statusInfo?.label}</Badge>
                          <Badge className={`text-xs ${priorityInfo?.color ?? ""}`}>{priorityInfo?.label}</Badge>
                          {isOverdue && <Badge variant="destructive" className="text-xs">SLA Overdue</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{thread.channel_type}</span>
                          {thread.contact_name && <span>{thread.contact_name}</span>}
                          <span>{thread.message_count} messages</span>
                          {thread.last_message_at && (
                            <span>{formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true })}</span>
                          )}
                        </div>
                        {thread.ai_summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{thread.ai_summary}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={prevPage} disabled={page === 0}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={nextPage} disabled={page + 1 >= totalPages}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Thread Detail */}
        {selectedThread && (
          <ThreadDetail
            thread={selectedThread}
            onClose={() => setSelectedThread(null)}
            onUpdate={(updates) => {
              updateThread.mutate({ id: selectedThread.id, ...updates });
              setSelectedThread({ ...selectedThread, ...updates });
            }}
          />
        )}

        {/* Create Dialog */}
        <CreateThreadDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={(data) => {
            createThread.mutate(data);
            setShowCreate(false);
          }}
        />
      </div>
    </DashboardLayout>
  );
};

const ThreadDetail = ({
  thread,
  onClose,
  onUpdate,
}: {
  thread: ConversationThread;
  onClose: () => void;
  onUpdate: (updates: Partial<ConversationThread>) => void;
}) => {
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

const CreateThreadDialog = ({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: Partial<ConversationThread>) => void;
}) => {
  const [subject, setSubject] = useState("");
  const [contactName, setContactName] = useState("");
  const [channelType, setChannelType] = useState("email");
  const [priority, setPriority] = useState("normal");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Conversation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Support request..." />
          </div>
          <div>
            <Label>Contact Name</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Channel</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="website_chat">Website Chat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_LEVELS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!subject.trim()}
            onClick={() => {
              onCreate({ subject, contact_name: contactName || null, channel_type: channelType, priority });
              setSubject("");
              setContactName("");
            }}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Helpdesk;
