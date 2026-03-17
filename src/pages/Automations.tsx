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
import {
  useAutomationWorkflows,
  useAutomationLogs,
  TRIGGER_TYPES,
  ACTION_TYPES,
  type AutomationWorkflow,
  type AutomationAction,
} from "@/hooks/useAutomations";
import { AutomationTemplates } from "@/components/AutomationTemplates";
import {
  Workflow,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Zap,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Settings,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const Automations = () => {
  const { workflows, isLoading, createWorkflow, updateWorkflow, deleteWorkflow, toggleActive } =
    useAutomationWorkflows();
  const [showCreate, setShowCreate] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<AutomationWorkflow | null>(null);
  const [viewingLogs, setViewingLogs] = useState<AutomationWorkflow | null>(null);

  const activeCount = workflows.filter((w) => w.is_active).length;
  const totalExecutions = workflows.reduce((sum, w) => sum + (w.execution_count || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Automations</h1>
            <p className="text-sm text-muted-foreground">Event-driven workflows to automate your business processes</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Workflow
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Workflow className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{workflows.length}</p>
                <p className="text-xs text-muted-foreground">Total Workflows</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
                <Play className="h-4 w-4 text-green-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <Zap className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{totalExecutions}</p>
                <p className="text-xs text-muted-foreground">Total Executions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workflow List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workflows.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Workflow className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium text-foreground mb-2">No workflows yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Create automation workflows to handle leads, messages, and pipeline changes automatically
              </p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" /> Create Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => {
              const triggerInfo = TRIGGER_TYPES.find((t) => t.value === workflow.trigger_type);
              const actionCount = (workflow.actions as unknown as AutomationAction[])?.length ?? 0;

              return (
                <Card key={workflow.id} className={`transition-colors ${workflow.is_active ? "hover:border-primary/20" : "opacity-70"}`}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Workflow className="h-4 w-4 text-primary shrink-0" />
                        <h3 className="font-medium text-foreground truncate">{workflow.name}</h3>
                        <Badge variant={workflow.is_active ? "default" : "secondary"} className="text-xs">
                          {workflow.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">{triggerInfo?.label || workflow.trigger_type}</Badge>
                        <ArrowRight className="h-3 w-3" />
                        <span>{actionCount} action{actionCount !== 1 ? "s" : ""}</span>
                        <span>• {workflow.execution_count} runs</span>
                        {workflow.last_executed_at && (
                          <span>• Last: {formatDistanceToNow(new Date(workflow.last_executed_at), { addSuffix: true })}</span>
                        )}
                      </div>
                      {workflow.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{workflow.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={workflow.is_active}
                        onCheckedChange={(v) => toggleActive.mutate({ id: workflow.id, is_active: v })}
                      />
                      <Button size="sm" variant="ghost" onClick={() => setViewingLogs(workflow)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingWorkflow(workflow)}>
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => deleteWorkflow.mutate(workflow.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Create / Edit */}
        {(showCreate || editingWorkflow) && (
          <WorkflowEditor
            workflow={editingWorkflow}
            onClose={() => { setShowCreate(false); setEditingWorkflow(null); }}
            onSave={(data) => {
              if (editingWorkflow) {
                updateWorkflow.mutate({ id: editingWorkflow.id, ...data });
              } else {
                createWorkflow.mutate(data);
              }
              setShowCreate(false);
              setEditingWorkflow(null);
            }}
          />
        )}

        {/* Logs */}
        {viewingLogs && (
          <WorkflowLogs workflow={viewingLogs} onClose={() => setViewingLogs(null)} />
        )}
      </div>
    </DashboardLayout>
  );
};

const WorkflowEditor = ({
  workflow,
  onClose,
  onSave,
}: {
  workflow: AutomationWorkflow | null;
  onClose: () => void;
  onSave: (data: Partial<AutomationWorkflow>) => void;
}) => {
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type ?? "new_lead");
  const [actions, setActions] = useState<AutomationAction[]>(
    (workflow?.actions as unknown as AutomationAction[]) ?? []
  );

  const addAction = () => {
    setActions([
      ...actions,
      { id: crypto.randomUUID(), type: "notify_internal", config: {} },
    ]);
  };

  const updateAction = (idx: number, updates: Partial<AutomationAction>) => {
    setActions(actions.map((a, i) => (i === idx ? { ...a, ...updates } : a)));
  };

  const removeAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workflow ? "Edit Workflow" : "Create Workflow"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Workflow Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Auto-assign new leads" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When a new lead comes in..." rows={2} />
          </div>

          {/* Trigger */}
          <div>
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Actions</Label>
              <Button size="sm" variant="outline" onClick={addAction}>
                <Plus className="h-3 w-3 mr-1" /> Add Action
              </Button>
            </div>
            <div className="space-y-2">
              {actions.map((action, idx) => (
                <div key={action.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                  <Select
                    value={action.type}
                    onValueChange={(v) => updateAction(idx, { type: v })}
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-20"
                    value={action.delay_minutes ?? 0}
                    onChange={(e) => updateAction(idx, { delay_minutes: Number(e.target.value) })}
                    placeholder="Delay"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeAction(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {actions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">Add at least one action</p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || actions.length === 0}
            onClick={() => onSave({ name, description, trigger_type: triggerType, actions: actions as any })}
          >
            {workflow ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const WorkflowLogs = ({ workflow, onClose }: { workflow: AutomationWorkflow; onClose: () => void }) => {
  const { data: logs, isLoading } = useAutomationLogs(workflow.id);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Execution Logs — {workflow.name}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin mx-auto my-8" />
        ) : !logs?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No executions yet</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  {log.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <Badge variant={log.status === "success" ? "secondary" : "destructive"} className="text-xs">
                    {log.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{log.trigger_event}</span>
                  {log.duration_ms && <span className="text-xs text-muted-foreground">{log.duration_ms}ms</span>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(log.created_at), "PP p")}
                  </span>
                </div>
                {log.error_message && (
                  <p className="text-xs text-destructive mt-1">{log.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default Automations;
