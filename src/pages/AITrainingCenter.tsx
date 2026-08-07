// AI Training Center — teach and improve the business AI.
// Tabs: Knowledge Base, Staff Corrections, AI Learning History, Test AI.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Brain, CheckCircle, AlertCircle, Plus, Trash2,
  Send, RefreshCw, BookOpen, History, FlaskConical, Star,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

type Tab = "knowledge" | "feedback" | "history" | "test";

interface TrainingItem {
  id: string; type: string; question: string; answer: string;
  priority: number; is_active: boolean;
}
interface Memory {
  id: string; entity_type: string; memory_key: string;
  memory_value: Record<string, unknown> | null; confidence: number;
  source: string; created_at: string;
}

export default function AITrainingCenter() {
  const [tab, setTab] = useState<Tab>("knowledge");
  const [workspaceId, setWorkspaceId] = useState("");
  const [training, setTraining] = useState<TrainingItem[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memFilter, setMemFilter] = useState("all");
  const [newQ, setNewQ] = useState("");
  const [newA, setNewA] = useState("");
  const [newType, setNewType] = useState<"faq" | "objection" | "policy">("faq");
  const [addingKnowledge, setAddingKnowledge] = useState(false);
  const [testQ, setTestQ] = useState("");
  const [testAnswer, setTestAnswer] = useState("");
  const [testing, setTesting] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const wsId = user.id;
    setWorkspaceId(wsId);
    const [trainingRes, memRes] = await Promise.all([
      supabase.from("ai_training_data").select("*").eq("workspace_id", wsId).order("priority", { ascending: false }),
      supabase.from("business_memory").select("*").eq("business_id", wsId).order("created_at", { ascending: false }).limit(100),
    ]);
    setTraining((trainingRes.data ?? []) as TrainingItem[]);
    setMemories((memRes.data ?? []) as Memory[]);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const corrections = memories.filter((m) => m.source === "staff_correction");
  const approvals = memories.filter((m) => m.source === "approval");
  const totalFeedback = corrections.length + approvals.length;
  const approvalRate = totalFeedback > 0 ? Math.round((approvals.length / totalFeedback) * 100) : 0;

  const addKnowledge = async () => {
    if (!newQ.trim() || !newA.trim()) return;
    setAddingKnowledge(true);
    const { error } = await supabase.from("ai_training_data").insert({
      workspace_id: workspaceId,
      type: newType,
      question: newQ.trim(),
      answer: newA.trim(),
      priority: 8,
      is_active: true,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Added — the AI knows this now." });
      setNewQ(""); setNewA("");
      loadAll();
    }
    setAddingKnowledge(false);
  };

  const deleteKnowledge = async (id: string) => {
    await supabase.from("ai_training_data").delete().eq("id", id);
    toast({ title: "Deleted" });
    loadAll();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("ai_training_data").update({ is_active: !current }).eq("id", id);
    loadAll();
  };

  const testAI = async () => {
    if (!testQ.trim()) return;
    setTesting(true);
    setTestAnswer("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-router`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          messages: [{ role: "user", content: testQ }],
          task_type: "customer_support",
          workspace_id: workspaceId,
          max_tokens: 400,
        }),
      });
      const data = await res.json() as { text?: string };
      setTestAnswer(data.text ?? "No response received.");
    } catch {
      setTestAnswer("Something went wrong while testing the AI. Please try again.");
    } finally {
      setTesting(false);
    }
  };

  const memTypes = ["all", "product", "faq_answer", "business_hour", "staff_correction", "policy", "agent_insight"];
  const filteredMem = memFilter === "all" ? memories : memories.filter((m) => m.entity_type === memFilter);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          <Brain className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">AI Training Center</h1>
            <p className="text-muted-foreground text-sm">Teach and improve your business AI</p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={loadAll}>
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Knowledge items", value: training.length, icon: BookOpen },
            { label: "Corrections", value: corrections.length, icon: AlertCircle },
            { label: "Approvals", value: approvals.length, icon: CheckCircle },
            { label: "Approval rate", value: `${approvalRate}%`, icon: Star },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3 text-center">
                <s.icon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <div className="text-xl font-semibold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {([
            ["knowledge", "Knowledge Base", BookOpen],
            ["feedback", "Staff Corrections", AlertCircle],
            ["history", "AI History", History],
            ["test", "Test AI", FlaskConical],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>

        {tab === "knowledge" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />Add new knowledge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="faq">FAQ</SelectItem>
                      <SelectItem value="objection">Objection</SelectItem>
                      <SelectItem value="policy">Policy</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Question or trigger (e.g. 'How much does it cost?')"
                    value={newQ}
                    onChange={(e) => setNewQ(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <Textarea
                  placeholder="The answer the AI should give..."
                  value={newA}
                  onChange={(e) => setNewA(e.target.value)}
                  rows={3}
                />
                <Button onClick={addKnowledge} disabled={addingKnowledge || !newQ || !newA}>
                  {addingKnowledge ? "Adding..." : "Add to AI"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {training.map((item) => (
                <Card key={item.id} className={!item.is_active ? "opacity-50" : ""}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{item.type}</Badge>
                          <span className="font-medium text-sm truncate">{item.question}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.answer}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleActive(item.id, item.is_active)}
                          className={`p-1.5 rounded ${item.is_active ? "text-green-600" : "text-muted-foreground"}`}
                          title={item.is_active ? "Deactivate" : "Activate"}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteKnowledge(item.id)} className="p-1.5 rounded text-destructive" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {training.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No knowledge added yet. Start with your business FAQs.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "feedback" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-3">
              Corrections your staff made to AI replies. Every correction is learned automatically.
            </p>
            {corrections.map((m) => {
              const v = (m.memory_value ?? {}) as Record<string, string>;
              return (
                <Card key={m.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{m.entity_type}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(m.created_at), "dd/MM HH:mm")}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">AI said:</span>
                        <p className="mt-1 line-clamp-3">{v.original}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Correction:</span>
                        <p className="mt-1 line-clamp-3">{v.correction}</p>
                      </div>
                    </div>
                    {v.lesson && <p className="text-xs text-muted-foreground mt-2">Lesson: {v.lesson}</p>}
                  </CardContent>
                </Card>
              );
            })}
            {corrections.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">No staff corrections recorded yet.</p>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {memTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setMemFilter(t)}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${memFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            {filteredMem.map((m) => (
              <Card key={m.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{m.entity_type}</Badge>
                    <span className="text-sm font-medium truncate">{m.memory_key}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {Math.round((m.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {JSON.stringify(m.memory_value)}
                  </p>
                </CardContent>
              </Card>
            ))}
            {filteredMem.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">Nothing learned in this category yet.</p>
            )}
          </div>
        )}

        {tab === "test" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Test the AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Ask a question the way a customer would..."
                value={testQ}
                onChange={(e) => setTestQ(e.target.value)}
                rows={3}
              />
              <Button onClick={testAI} disabled={testing || !testQ.trim()}>
                <Send className="h-4 w-4 mr-2" />{testing ? "Testing..." : "Send to AI"}
              </Button>
              {testAnswer && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                  {testAnswer}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
