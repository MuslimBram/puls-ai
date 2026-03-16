import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChatbotFlows, useChatbotSessions, type ChatbotFlow, type ChatbotQuestion } from "@/hooks/useChatbotFlows";
import {
  Bot,
  Plus,
  Trash2,
  Settings,
  Eye,
  Loader2,
  GripVertical,
  MessageCircle,
  BarChart3,
  Users,
} from "lucide-react";
import { format } from "date-fns";

const QUESTION_TYPES = [
  { value: "text", label: "Text" },
  { value: "select", label: "Multiple Choice" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

const LeadQualification = () => {
  const { flows, isLoading, createFlow, updateFlow, deleteFlow, toggleActive } = useChatbotFlows();
  const [showCreate, setShowCreate] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [viewingFlow, setViewingFlow] = useState<ChatbotFlow | null>(null);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lead Qualification</h1>
            <p className="text-sm text-muted-foreground">Configure chatbot flows to qualify and score leads</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Flow
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : flows.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Bot className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">No chatbot flows yet</p>
              <p className="text-sm text-muted-foreground mb-4">Create a qualification flow to automatically score and route leads</p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create Flow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {flows.map((flow) => (
              <Card key={flow.id} className="hover:border-primary/20 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      {flow.name}
                    </CardTitle>
                    <Switch
                      checked={flow.is_active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: flow.id, is_active: v })}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {flow.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{flow.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{flow.questions?.length || 0} questions</Badge>
                    <Badge variant={flow.is_active ? "default" : "secondary"}>
                      {flow.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setViewingFlow(flow)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingFlow(flow)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteFlow.mutate(flow.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Flow */}
        {(showCreate || editingFlow) && (
          <FlowEditor
            flow={editingFlow}
            onClose={() => { setShowCreate(false); setEditingFlow(null); }}
            onSave={(data) => {
              if (editingFlow) {
                updateFlow.mutate({ id: editingFlow.id, ...data });
              } else {
                createFlow.mutate(data);
              }
              setShowCreate(false);
              setEditingFlow(null);
            }}
          />
        )}

        {/* View Sessions */}
        {viewingFlow && (
          <FlowSessions flow={viewingFlow} onClose={() => setViewingFlow(null)} />
        )}
      </div>
    </DashboardLayout>
  );
};

const FlowEditor = ({
  flow,
  onClose,
  onSave,
}: {
  flow: ChatbotFlow | null;
  onClose: () => void;
  onSave: (data: Partial<ChatbotFlow>) => void;
}) => {
  const [name, setName] = useState(flow?.name ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [welcomeMsg, setWelcomeMsg] = useState(flow?.welcome_message ?? "Hi! I have a few questions to help us serve you better.");
  const [completionMsg, setCompletionMsg] = useState(flow?.completion_message ?? "Thank you! Our team will be in touch shortly.");
  const [questions, setQuestions] = useState<ChatbotQuestion[]>(flow?.questions ?? []);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        text: "",
        type: "text",
        required: true,
        score_weight: 1,
        options: [],
      },
    ]);
  };

  const updateQuestion = (idx: number, updates: Partial<ChatbotQuestion>) => {
    setQuestions(questions.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{flow ? "Edit Flow" : "Create Qualification Flow"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Flow Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service Inquiry Flow" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qualifies leads asking about our services..." rows={2} />
          </div>
          <div>
            <Label>Welcome Message</Label>
            <Textarea value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} rows={2} />
          </div>
          <div>
            <Label>Completion Message</Label>
            <Textarea value={completionMsg} onChange={(e) => setCompletionMsg(e.target.value)} rows={2} />
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Questions</Label>
              <Button size="sm" variant="outline" onClick={addQuestion}>
                <Plus className="h-3 w-3 mr-1" /> Add Question
              </Button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div key={q.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-2 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Input
                        value={q.text}
                        onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                        placeholder="What service are you interested in?"
                      />
                      <div className="flex gap-2">
                        <Select value={q.type} onValueChange={(v) => updateQuestion(idx, { type: v as any })}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {QUESTION_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="w-20"
                          value={q.score_weight}
                          onChange={(e) => updateQuestion(idx, { score_weight: Number(e.target.value) })}
                          placeholder="Weight"
                        />
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeQuestion(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {q.type === "select" && (
                        <Input
                          value={q.options?.join(", ") ?? ""}
                          onChange={(e) => updateQuestion(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                          placeholder="Option 1, Option 2, Option 3"
                          className="text-xs"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => onSave({ name, description, welcome_message: welcomeMsg, completion_message: completionMsg, questions })}>
            {flow ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FlowSessions = ({ flow, onClose }: { flow: ChatbotFlow; onClose: () => void }) => {
  const { data: sessions, isLoading } = useChatbotSessions(flow.id);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Sessions — {flow.name}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="sessions">
          <TabsList>
            <TabsTrigger value="sessions">Sessions ({sessions?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
          </TabsList>
          <TabsContent value="sessions">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" />
            ) : !sessions?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">No sessions yet</p>
            ) : (
              <div className="space-y-2 mt-3">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{s.visitor_name || s.visitor_email || "Anonymous"}</span>
                      <Badge variant="secondary" className="text-xs">{s.status}</Badge>
                      <Badge variant="outline" className="text-xs">Score: {Math.round(Number(s.quality_score) * 100)}%</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{format(new Date(s.created_at), "PP")}</span>
                    </div>
                    {s.ai_summary && <p className="text-xs text-muted-foreground">{s.ai_summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="stats">
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{sessions?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Total Sessions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {sessions?.filter((s) => s.status === "completed").length ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {sessions?.length
                      ? Math.round((sessions.reduce((sum, s) => sum + Number(s.quality_score), 0) / sessions.length) * 100)
                      : 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LeadQualification;
