import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useIvrBuilder, IvrFlow, IvrNode } from "@/hooks/useIvrBuilder";
import {
  Plus, Phone, MessageSquare, ArrowRightLeft, Voicemail, Clock,
  Play, Trash2, Upload, CheckCircle2, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NODE_TYPES = [
  { type: "greeting", label: "Greeting", icon: MessageSquare, color: "border-primary/50 bg-primary/5" },
  { type: "menu", label: "Menu", icon: Phone, color: "border-blue-500/50 bg-blue-500/5" },
  { type: "transfer", label: "Transfer", icon: ArrowRightLeft, color: "border-green-500/50 bg-green-500/5" },
  { type: "voicemail", label: "Voicemail", icon: Voicemail, color: "border-orange-500/50 bg-orange-500/5" },
  { type: "time_check", label: "Time Check", icon: Clock, color: "border-purple-500/50 bg-purple-500/5" },
  { type: "play_message", label: "Play Message", icon: Play, color: "border-yellow-500/50 bg-yellow-500/5" },
  { type: "hangup", label: "Hang Up", icon: XCircle, color: "border-destructive/50 bg-destructive/5" },
] as const;

export const IvrBuilderPanel = () => {
  const { flows, isLoading, createFlow, updateFlow, publishFlow, deleteFlow } = useIvrBuilder();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [editingNode, setEditingNode] = useState<IvrNode | null>(null);

  const selectedFlow = flows.find((f) => f.id === selectedFlowId);

  const handleCreate = () => {
    if (!newFlowName.trim()) return;
    createFlow.mutate({ name: newFlowName, description: newFlowDesc || undefined });
    setShowCreate(false);
    setNewFlowName("");
    setNewFlowDesc("");
  };

  const addNode = (type: IvrNode["type"]) => {
    if (!selectedFlow) return;
    const newNode: IvrNode = {
      id: `${type}-${Date.now()}`,
      type,
      label: NODE_TYPES.find((n) => n.type === type)?.label || type,
      x: 100 + Math.random() * 200,
      y: (selectedFlow.nodes.length + 1) * 120,
      config: {},
    };
    updateFlow.mutate({
      id: selectedFlow.id,
      nodes: [...selectedFlow.nodes, newNode] as any,
    });
  };

  const removeNode = (nodeId: string) => {
    if (!selectedFlow) return;
    updateFlow.mutate({
      id: selectedFlow.id,
      nodes: selectedFlow.nodes.filter((n) => n.id !== nodeId) as any,
      edges: selectedFlow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId) as any,
    });
  };

  const updateNodeConfig = (nodeId: string, config: Record<string, unknown>) => {
    if (!selectedFlow) return;
    updateFlow.mutate({
      id: selectedFlow.id,
      nodes: selectedFlow.nodes.map((n) =>
        n.id === nodeId ? { ...n, config: { ...n.config, ...config } } : n
      ) as any,
    });
    setEditingNode(null);
  };

  return (
    <div className="space-y-4">
      {/* Flow list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">IVR Flows</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> New Flow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create IVR Flow</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)} placeholder="e.g. Main Menu" /></div>
              <div><Label>Description</Label><Textarea value={newFlowDesc} onChange={(e) => setNewFlowDesc(e.target.value)} placeholder="Describe this flow..." /></div>
              <Button onClick={handleCreate} className="w-full">Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
      ) : flows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No IVR flows. Create one to design your call routing.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className={cn("cursor-pointer transition-colors hover:bg-muted/50",
                selectedFlowId === flow.id && "ring-1 ring-primary"
              )}
              onClick={() => setSelectedFlowId(flow.id === selectedFlowId ? null : flow.id)}
            >
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{flow.name}</p>
                  <p className="text-[10px] text-muted-foreground">{flow.nodes.length} nodes · v{flow.version}</p>
                </div>
                <div className="flex items-center gap-1">
                  {flow.is_active ? (
                    <Badge className="bg-green-500/10 text-green-600 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" /> Active</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Draft</Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); publishFlow.mutate(flow.id); }}>
                    <Upload className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteFlow.mutate(flow.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Flow editor */}
      {selectedFlow && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Edit: {selectedFlow.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add node toolbar */}
            <div className="flex flex-wrap gap-1">
              {NODE_TYPES.map((nt) => (
                <Button
                  key={nt.type}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => addNode(nt.type)}
                >
                  <nt.icon className="h-3 w-3" /> {nt.label}
                </Button>
              ))}
            </div>

            {/* Node list (visual representation) */}
            <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/30 min-h-[200px]">
              {selectedFlow.nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Add nodes to build your IVR flow.</p>
              ) : (
                selectedFlow.nodes.map((node, idx) => {
                  const nodeType = NODE_TYPES.find((n) => n.type === node.type);
                  const Icon = nodeType?.icon || MessageSquare;
                  return (
                    <div key={node.id}>
                      <div
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-colors hover:bg-background",
                          nodeType?.color || "border-border"
                        )}
                        onClick={() => setEditingNode(node)}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{node.label}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {node.config.message || node.config.prompt || node.config.target_queue || "Click to configure"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                      {idx < selectedFlow.nodes.length - 1 && (
                        <div className="flex justify-center py-1">
                          <div className="w-px h-4 bg-border" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Node editor dialog */}
            <Dialog open={!!editingNode} onOpenChange={(open) => !open && setEditingNode(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configure: {editingNode?.label}</DialogTitle>
                </DialogHeader>
                {editingNode && (
                  <NodeConfigEditor
                    node={editingNode}
                    onSave={(config) => updateNodeConfig(editingNode.id, config)}
                  />
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const NodeConfigEditor = ({ node, onSave }: { node: IvrNode; onSave: (config: Record<string, unknown>) => void }) => {
  const [config, setConfig] = useState<Record<string, unknown>>(node.config);

  const update = (key: string, value: unknown) => setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-3">
      {(node.type === "greeting" || node.type === "play_message") && (
        <div>
          <Label>Message Text</Label>
          <Textarea
            value={(config.message as string) || ""}
            onChange={(e) => update("message", e.target.value)}
            placeholder="Enter the message to play..."
          />
        </div>
      )}
      {node.type === "menu" && (
        <>
          <div>
            <Label>Menu Prompt</Label>
            <Textarea
              value={(config.prompt as string) || ""}
              onChange={(e) => update("prompt", e.target.value)}
              placeholder="Press 1 for Sales, 2 for Support..."
            />
          </div>
          <div>
            <Label>Timeout (seconds)</Label>
            <Input
              type="number"
              value={(config.timeout as number) || 10}
              onChange={(e) => update("timeout", Number(e.target.value))}
            />
          </div>
        </>
      )}
      {node.type === "transfer" && (
        <>
          <div>
            <Label>Transfer Target (queue name or number)</Label>
            <Input
              value={(config.target_queue as string) || ""}
              onChange={(e) => update("target_queue", e.target.value)}
              placeholder="e.g. Sales Queue"
            />
          </div>
          <div>
            <Label>Announcement</Label>
            <Input
              value={(config.announcement as string) || ""}
              onChange={(e) => update("announcement", e.target.value)}
              placeholder="Transferring you now..."
            />
          </div>
        </>
      )}
      {node.type === "voicemail" && (
        <div>
          <Label>Voicemail Greeting</Label>
          <Textarea
            value={(config.greeting as string) || ""}
            onChange={(e) => update("greeting", e.target.value)}
            placeholder="Please leave a message after the beep..."
          />
        </div>
      )}
      {node.type === "time_check" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Business Hours Start</Label>
            <Input type="time" value={(config.start_time as string) || "09:00"} onChange={(e) => update("start_time", e.target.value)} />
          </div>
          <div>
            <Label>Business Hours End</Label>
            <Input type="time" value={(config.end_time as string) || "17:00"} onChange={(e) => update("end_time", e.target.value)} />
          </div>
        </div>
      )}
      <Button onClick={() => onSave(config)} className="w-full">Save Configuration</Button>
    </div>
  );
};
