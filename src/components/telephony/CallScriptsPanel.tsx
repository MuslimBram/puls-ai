import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCallScripts, CallScript, ScriptStep } from "@/hooks/useCallScripts";
import { Plus, FileText, Trash2, Play, Zap, Shield, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const SCRIPT_TYPE_META = {
  script: { label: "Call Script", icon: FileText, color: "text-primary" },
  macro: { label: "Quick Macro", icon: Zap, color: "text-yellow-600" },
  objection_handler: { label: "Objection Handler", icon: Shield, color: "text-destructive" },
};

const STEP_TYPES = [
  { type: "talk", label: "Talk Track" },
  { type: "question", label: "Question" },
  { type: "objection", label: "Objection" },
  { type: "action", label: "Action Item" },
  { type: "note", label: "Note" },
] as const;

export const CallScriptsPanel = () => {
  const { scripts, isLoading, createScript, updateScript, deleteScript, trackUsage } = useCallScripts();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<string>("script");
  const [newDesc, setNewDesc] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeScript, setActiveScript] = useState<CallScript | null>(null);

  const selected = scripts.find((s) => s.id === selectedId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createScript.mutate({ name: newName, scriptType: newType, description: newDesc || undefined });
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
  };

  const addStep = (type: ScriptStep["type"]) => {
    if (!selected) return;
    const step: ScriptStep = { id: `step-${Date.now()}`, type, text: "", options: [] };
    updateScript.mutate({ id: selected.id, content: [...selected.content, step] });
  };

  const updateStep = (stepId: string, text: string) => {
    if (!selected) return;
    updateScript.mutate({
      id: selected.id,
      content: selected.content.map((s) => (s.id === stepId ? { ...s, text } : s)),
    });
  };

  const removeStep = (stepId: string) => {
    if (!selected) return;
    updateScript.mutate({
      id: selected.id,
      content: selected.content.filter((s) => s.id !== stepId),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Call Scripts & Macros</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> New Script
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Script</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Cold Call Opener" /></div>
              <div>
                <Label>Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="script">Call Script</SelectItem>
                    <SelectItem value="macro">Quick Macro</SelectItem>
                    <SelectItem value="objection_handler">Objection Handler</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Description</Label><Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe this script..." /></div>
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
      ) : scripts.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No scripts yet. Create one to guide your calls.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {scripts.map((script) => {
            const meta = SCRIPT_TYPE_META[script.script_type as keyof typeof SCRIPT_TYPE_META] || SCRIPT_TYPE_META.script;
            const Icon = meta.icon;
            return (
              <Card
                key={script.id}
                className={cn("cursor-pointer transition-colors hover:bg-muted/50", selectedId === script.id && "ring-1 ring-primary")}
                onClick={() => setSelectedId(script.id === selectedId ? null : script.id)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <Icon className={cn("h-4 w-4 shrink-0", meta.color)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{script.name}</p>
                    <p className="text-[10px] text-muted-foreground">{script.content.length} steps · Used {script.usage_count}×</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={script.is_active ? "default" : "outline"} className="text-[10px]">
                      {script.is_active ? "Active" : "Draft"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                      e.stopPropagation();
                      setActiveScript(script);
                      trackUsage.mutate(script.id);
                    }}>
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteScript.mutate(script.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Script Editor */}
      {selected && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Edit: {selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {STEP_TYPES.map((st) => (
                <Button key={st.type} variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => addStep(st.type)}>
                  <Plus className="h-2.5 w-2.5 mr-0.5" /> {st.label}
                </Button>
              ))}
            </div>
            <div className="space-y-2 min-h-[100px]">
              {selected.content.map((step, idx) => (
                <div key={step.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{step.type}</Badge>
                  <Textarea
                    defaultValue={step.text}
                    onBlur={(e) => updateStep(step.id, e.target.value)}
                    placeholder={`Enter ${step.type} text...`}
                    className="text-xs min-h-[40px] flex-1"
                  />
                  <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeStep(step.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Script Runner Dialog */}
      <Dialog open={!!activeScript} onOpenChange={(open) => !open && setActiveScript(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="h-4 w-4" /> {activeScript?.name}</DialogTitle></DialogHeader>
          {activeScript && <ScriptRunner script={activeScript} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ScriptRunner = ({ script }: { script: CallScript }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const step = script.content[currentStep];

  if (!step) return <p className="text-sm text-muted-foreground text-center py-4">No steps in this script.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Step {currentStep + 1} of {script.content.length}</span>
        <Badge variant="outline" className="text-[10px]">{step.type}</Badge>
      </div>
      <div className="rounded-lg border border-border p-4 bg-muted/20 min-h-[80px]">
        <p className="text-sm text-foreground whitespace-pre-wrap">{step.text || "(empty step)"}</p>
      </div>
      <div className="flex justify-between">
        <Button variant="outline" size="sm" disabled={currentStep === 0} onClick={() => setCurrentStep((p) => p - 1)}>
          Previous
        </Button>
        <Button size="sm" disabled={currentStep >= script.content.length - 1} onClick={() => setCurrentStep((p) => p + 1)}>
          Next <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>
    </div>
  );
};
