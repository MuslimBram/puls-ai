import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatbotFlows, useChatbotSessions, type ChatbotFlow, type ChatbotQuestion, type ChatbotSession } from "@/hooks/useChatbotFlows";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  Bot, Plus, Trash2, GripVertical, MessageSquare, Eye, Settings2,
  Loader2, CheckCircle2, XCircle, ArrowDown, ArrowRight, Play,
  BarChart3, Users, Sparkles, Type, ListCheck, Hash, Mail, Phone,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";

const QUESTION_TYPES = [
  { value: "text", label: "Free Text", icon: Type },
  { value: "select", label: "Multiple Choice", icon: ListCheck },
  { value: "number", label: "Number", icon: Hash },
  { value: "email", label: "Email", icon: Mail },
  { value: "phone", label: "Phone", icon: Phone },
] as const;

const FLOW_TEMPLATES = [
  {
    name: "Lead Qualification",
    description: "Qualify inbound leads with budget and timeline questions",
    welcome: "👋 Hi! I'd like to learn about your needs so we can help you best.",
    completion: "Thank you! Our team will reach out within 24 hours.",
    questions: [
      { id: "q1", text: "What's your company name?", type: "text" as const, required: true, score_weight: 1 },
      { id: "q2", text: "How many employees do you have?", type: "select" as const, options: ["1-10", "11-50", "51-200", "200+"], required: true, score_weight: 2 },
      { id: "q3", text: "What's your monthly budget?", type: "select" as const, options: ["Under $500", "$500-$2,000", "$2,000-$10,000", "$10,000+"], required: true, score_weight: 3 },
      { id: "q4", text: "When are you looking to get started?", type: "select" as const, options: ["Immediately", "This month", "Next quarter", "Just exploring"], required: true, score_weight: 2 },
      { id: "q5", text: "What's the best email to reach you?", type: "email" as const, required: true, score_weight: 1 },
    ],
  },
  {
    name: "Customer Support Triage",
    description: "Route customer issues to the right team",
    welcome: "Hello! I'm here to help. Let me understand your issue.",
    completion: "Got it! I'm routing this to the right team. You'll hear back shortly.",
    questions: [
      { id: "q1", text: "What type of issue are you experiencing?", type: "select" as const, options: ["Billing", "Technical", "Account", "Feature Request"], required: true, score_weight: 1 },
      { id: "q2", text: "How urgent is this issue?", type: "select" as const, options: ["Critical - blocking work", "High - impacting work", "Medium - workaround exists", "Low - nice to fix"], required: true, score_weight: 2 },
      { id: "q3", text: "Please describe the issue in detail:", type: "text" as const, required: true, score_weight: 1 },
      { id: "q4", text: "Your account email:", type: "email" as const, required: true, score_weight: 1 },
    ],
  },
  {
    name: "Appointment Booking",
    description: "Collect info before scheduling a meeting",
    welcome: "Let's get you scheduled! Just a few quick questions first.",
    completion: "Perfect! We'll send you a calendar invite shortly. 📅",
    questions: [
      { id: "q1", text: "What's your full name?", type: "text" as const, required: true, score_weight: 1 },
      { id: "q2", text: "Your email address:", type: "email" as const, required: true, score_weight: 1 },
      { id: "q3", text: "Your phone number:", type: "phone" as const, required: false, score_weight: 1 },
      { id: "q4", text: "What would you like to discuss?", type: "select" as const, options: ["Product Demo", "Pricing", "Partnership", "Other"], required: true, score_weight: 2 },
      { id: "q5", text: "Preferred meeting time?", type: "select" as const, options: ["Morning (9-12)", "Afternoon (12-5)", "Evening (5-8)"], required: true, score_weight: 1 },
    ],
  },
];

export const ChatbotFlowBuilder = () => {
  const { flows, isLoading, createFlow, updateFlow, deleteFlow, toggleActive } = useChatbotFlows();
  const { workspace } = useWorkspace();
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [previewFlow, setPreviewFlow] = useState<ChatbotFlow | null>(null);
  const [sessionsFlowId, setSessionsFlowId] = useState<string | null>(null);

  const handleCreateFromTemplate = (tpl: typeof FLOW_TEMPLATES[0]) => {
    createFlow.mutate({
      name: tpl.name,
      description: tpl.description,
      welcome_message: tpl.welcome,
      completion_message: tpl.completion,
      questions: tpl.questions as any,
      scoring_rules: {},
      is_active: false,
      workspace_id: workspace?.id || null,
    } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Chatbot Flows
          </h2>
          <p className="text-xs text-muted-foreground">Design conversational flows to qualify leads and route inquiries</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-3 w-3 mr-1" /> New Flow
        </Button>
      </div>

      {/* Existing Flows */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No chatbot flows yet</p>
            <p className="text-xs text-muted-foreground mb-4">Start from a template or create a custom flow</p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> Create First Flow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="relative">
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground truncate">{flow.name}</h3>
                  <Switch
                    checked={flow.is_active}
                    onCheckedChange={(checked) => toggleActive.mutate({ id: flow.id, is_active: checked })}
                  />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{flow.description || "No description"}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" /> {flow.questions?.length || 0} questions
                  </Badge>
                  <Badge variant={flow.is_active ? "default" : "secondary"} className="text-xs">
                    {flow.is_active ? "Live" : "Draft"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingFlow(flow)}>
                    <Settings2 className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPreviewFlow(flow)}>
                    <Eye className="h-3 w-3 mr-1" /> Preview
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSessionsFlowId(flow.id)}>
                    <BarChart3 className="h-3 w-3 mr-1" /> Sessions
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteFlow.mutate(flow.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create from Template Dialog */}
      {showCreate && (
        <Dialog open onOpenChange={() => setShowCreate(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create New Flow</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Start from a template or build from scratch.</p>
              {FLOW_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.name}
                  className="rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => { handleCreateFromTemplate(tpl); setShowCreate(false); }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                    <Badge variant="secondary" className="text-xs">{tpl.questions.length} questions</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{tpl.description}</p>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => {
                createFlow.mutate({
                  name: "New Flow",
                  description: "",
                  welcome_message: "Hi! How can I help you?",
                  completion_message: "Thanks for your time!",
                  questions: [] as any,
                  scoring_rules: {},
                  is_active: false,
                  workspace_id: workspace?.id || null,
                } as any);
                setShowCreate(false);
              }}>
                <Plus className="h-3 w-3 mr-1" /> Blank Flow
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Flow Dialog */}
      {editingFlow && (
        <FlowEditorDialog
          flow={editingFlow}
          onClose={() => setEditingFlow(null)}
          onSave={(updates) => {
            updateFlow.mutate({ id: editingFlow.id, ...updates });
            setEditingFlow(null);
          }}
        />
      )}

      {/* Preview Dialog */}
      {previewFlow && (
        <FlowPreviewDialog flow={previewFlow} onClose={() => setPreviewFlow(null)} />
      )}

      {/* Sessions Dialog */}
      {sessionsFlowId && (
        <FlowSessionsDialog flowId={sessionsFlowId} onClose={() => setSessionsFlowId(null)} />
      )}
    </div>
  );
};

/* ═══════════════ FLOW EDITOR ═══════════════ */
const FlowEditorDialog = ({
  flow,
  onClose,
  onSave,
}: {
  flow: ChatbotFlow;
  onClose: () => void;
  onSave: (updates: Partial<ChatbotFlow>) => void;
}) => {
  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description || "");
  const [welcome, setWelcome] = useState(flow.welcome_message || "");
  const [completion, setCompletion] = useState(flow.completion_message || "");
  const [questions, setQuestions] = useState<ChatbotQuestion[]>(flow.questions || []);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}`,
        text: "",
        type: "text",
        required: true,
        score_weight: 1,
      },
    ]);
  };

  const updateQuestion = (idx: number, updates: Partial<ChatbotQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= questions.length) return;
    const copy = [...questions];
    [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
    setQuestions(copy);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader><DialogTitle>Edit Flow: {name}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-4">
            <Tabs defaultValue="settings">
              <TabsList className="mb-3">
                <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
                <TabsTrigger value="questions" className="text-xs">Questions ({questions.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-3">
                <div>
                  <Label>Flow Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                </div>
                <div>
                  <Label>Welcome Message</Label>
                  <Textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={2} placeholder="First message visitors see" />
                </div>
                <div>
                  <Label>Completion Message</Label>
                  <Textarea value={completion} onChange={(e) => setCompletion(e.target.value)} rows={2} placeholder="Shown after all questions answered" />
                </div>
              </TabsContent>

              <TabsContent value="questions" className="space-y-3">
                {questions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No questions yet. Add your first question below.</p>
                )}

                {questions.map((q, idx) => {
                  const TypeIcon = QUESTION_TYPES.find((t) => t.value === q.type)?.icon || Type;
                  return (
                    <Card key={q.id} className="relative">
                      <CardContent className="pt-3 pb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs shrink-0">
                            <TypeIcon className="h-3 w-3 mr-1" /> {idx + 1}
                          </Badge>
                          <Input
                            value={q.text}
                            onChange={(e) => updateQuestion(idx, { text: e.target.value })}
                            placeholder="Question text..."
                            className="text-sm"
                          />
                          <div className="flex gap-0.5 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}>
                              <ArrowDown className="h-3 w-3 rotate-180" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}>
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeQuestion(idx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex gap-2 flex-wrap items-center">
                          <Select value={q.type} onValueChange={(v) => updateQuestion(idx, { type: v as any })}>
                            <SelectTrigger className="w-32 h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {QUESTION_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={q.required}
                              onCheckedChange={(v) => updateQuestion(idx, { required: v })}
                            />
                            <span className="text-xs text-muted-foreground">Required</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Weight:</span>
                            <Select value={String(q.score_weight)} onValueChange={(v) => updateQuestion(idx, { score_weight: Number(v) })}>
                              <SelectTrigger className="w-14 h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((w) => (
                                  <SelectItem key={w} value={String(w)}>{w}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {q.type === "select" && (
                          <div>
                            <Label className="text-xs">Options (comma-separated)</Label>
                            <Input
                              value={(q.options || []).join(", ")}
                              onChange={(e) => updateQuestion(idx, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                              placeholder="Option 1, Option 2, Option 3"
                              className="text-xs"
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}

                <Button variant="outline" size="sm" onClick={addQuestion} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Add Question
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({
            name,
            description,
            welcome_message: welcome,
            completion_message: completion,
            questions: questions as any,
          })}>
            Save Flow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ═══════════════ FLOW PREVIEW (Chat Simulation) ═══════════════ */
const FlowPreviewDialog = ({ flow, onClose }: { flow: ChatbotFlow; onClose: () => void }) => {
  const [currentStep, setCurrentStep] = useState(-1); // -1 = welcome
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentInput, setCurrentInput] = useState("");
  const questions = flow.questions || [];

  const messages = useMemo(() => {
    const msgs: Array<{ from: "bot" | "user"; text: string }> = [];
    msgs.push({ from: "bot", text: flow.welcome_message || "Hello!" });

    for (let i = 0; i <= Math.min(currentStep, questions.length - 1); i++) {
      msgs.push({ from: "bot", text: questions[i].text });
      if (answers[questions[i].id]) {
        msgs.push({ from: "user", text: answers[questions[i].id] });
      }
    }
    if (currentStep >= questions.length) {
      msgs.push({ from: "bot", text: flow.completion_message || "Thank you!" });
    }
    return msgs;
  }, [currentStep, answers, flow, questions]);

  const handleAnswer = (answer: string) => {
    if (!answer.trim()) return;
    const q = questions[currentStep];
    if (q) {
      setAnswers((prev) => ({ ...prev, [q.id]: answer }));
    }
    setCurrentInput("");
    setCurrentStep((s) => s + 1);
  };

  const currentQuestion = currentStep >= 0 && currentStep < questions.length ? questions[currentStep] : null;
  const isComplete = currentStep >= questions.length;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="bg-primary p-3 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">{flow.name}</p>
              <p className="text-xs opacity-80">Preview Mode</p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-80 p-3">
          <div className="space-y-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.from === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {currentStep === -1 && (
              <div className="flex justify-center pt-2">
                <Button size="sm" onClick={() => setCurrentStep(0)}>
                  <Play className="h-3 w-3 mr-1" /> Start
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        {currentQuestion && !isComplete && (
          <div className="border-t border-border p-3 space-y-2">
            {currentQuestion.type === "select" ? (
              <div className="flex flex-wrap gap-1">
                {(currentQuestion.options || []).map((opt) => (
                  <Button key={opt} size="sm" variant="outline" className="text-xs" onClick={() => handleAnswer(opt)}>
                    {opt}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnswer(currentInput)}
                  placeholder={`Type your ${currentQuestion.type}...`}
                  className="text-sm"
                />
                <Button size="sm" onClick={() => handleAnswer(currentInput)}>Send</Button>
              </div>
            )}
          </div>
        )}

        {isComplete && (
          <div className="border-t border-border p-3 text-center">
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Flow Complete
            </Badge>
            <Button size="sm" variant="ghost" className="ml-2 text-xs" onClick={() => { setCurrentStep(-1); setAnswers({}); }}>
              Restart
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ═══════════════ SESSIONS ANALYTICS ═══════════════ */
const FlowSessionsDialog = ({ flowId, onClose }: { flowId: string; onClose: () => void }) => {
  const { data: sessions, isLoading } = useChatbotSessions(flowId);

  const completed = sessions?.filter((s) => s.status === "completed") || [];
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((s, c) => s + (c.quality_score || 0), 0) / completed.length)
    : 0;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader><DialogTitle>Session Analytics</DialogTitle></DialogHeader>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold">{sessions?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold">{completed.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-xl font-bold">{avgScore}</p>
              <p className="text-xs text-muted-foreground">Avg Score</p>
            </CardContent>
          </Card>
        </div>

        <ScrollArea className="max-h-[40vh]">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !sessions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No sessions recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {s.visitor_name || s.visitor_email || "Anonymous"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.status === "completed" ? "default" : s.status === "abandoned" ? "secondary" : "outline"} className="text-xs">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{s.quality_score || 0}</TableCell>
                    <TableCell className="text-xs">{s.channel_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "MMM d, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
