import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useSLAConfig,
  useAssignmentRules,
  useEscalationRules,
  useUpsertEscalationRule,
  useDeleteEscalationRule,
  type SLAConfig,
  type EscalationRule,
} from "@/hooks/useConversationEngine";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Clock, Users, ShieldAlert, Save, Plus, Trash2 } from "lucide-react";

export const HelpdeskConfigPanel = () => {
  const { workspace } = useWorkspace();
  const wsId = workspace?.id ?? null;

  return (
    <div className="space-y-6">
      <SLAConfigSection workspaceId={wsId} />
      <AssignmentConfigSection workspaceId={wsId} />
      <EscalationConfigSection workspaceId={wsId} />
    </div>
  );
};

// ── SLA Config ──
const SLAConfigSection = ({ workspaceId }: { workspaceId: string | null }) => {
  const { config, upsert } = useSLAConfig(workspaceId);
  const [fr, setFr] = useState(15);
  const [nr, setNr] = useState(30);
  const [res, setRes] = useState(480);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (config) {
      setFr(config.first_response_minutes);
      setNr(config.next_response_minutes);
      setRes(config.resolution_minutes);
      setActive((config as any).is_active ?? true);
    }
  }, [config]);

  const handleSave = () => {
    if (!workspaceId) return;
    upsert.mutate({
      workspace_id: workspaceId,
      first_response_minutes: fr,
      next_response_minutes: nr,
      resolution_minutes: res,
      is_active: active,
    } as any);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" /> SLA Configuration
        </CardTitle>
        <CardDescription>Set response time targets for your team</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={active} onCheckedChange={setActive} />
          <Label>SLA enforcement active</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">First Response (min)</Label>
            <Input type="number" value={fr} onChange={(e) => setFr(+e.target.value)} min={1} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Next Response (min)</Label>
            <Input type="number" value={nr} onChange={(e) => setNr(+e.target.value)} min={1} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Resolution Target (min)</Label>
            <Input type="number" value={res} onChange={(e) => setRes(+e.target.value)} min={1} />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          <Save className="h-3.5 w-3.5 mr-1.5" /> Save SLA
        </Button>
      </CardContent>
    </Card>
  );
};

// ── Assignment Rules ──
const AssignmentConfigSection = ({ workspaceId }: { workspaceId: string | null }) => {
  const { rules, upsert } = useAssignmentRules(workspaceId);
  const [strategy, setStrategy] = useState("manual");
  const [maxOpen, setMaxOpen] = useState(20);

  useEffect(() => {
    if (rules) {
      setStrategy(rules.strategy || "manual");
      setMaxOpen(rules.max_open_per_agent || 20);
    }
  }, [rules]);

  const handleSave = () => {
    if (!workspaceId) return;
    upsert.mutate({ strategy, max_open_per_agent: maxOpen });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Assignment Routing
        </CardTitle>
        <CardDescription>How new conversations are assigned to agents</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="round_robin">Round Robin</SelectItem>
                <SelectItem value="load_based">Load Based</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max Open per Agent</Label>
            <Input type="number" value={maxOpen} onChange={(e) => setMaxOpen(+e.target.value)} min={1} max={100} />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          <Save className="h-3.5 w-3.5 mr-1.5" /> Save Rules
        </Button>
      </CardContent>
    </Card>
  );
};

// ── Escalation Rules ──
const EscalationConfigSection = ({ workspaceId }: { workspaceId: string | null }) => {
  const { data: rules } = useEscalationRules(workspaceId ?? undefined);
  const upsertRule = useUpsertEscalationRule();
  const deleteRule = useDeleteEscalationRule();

  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    trigger_type: "sla_breach",
    trigger_minutes: 30,
    action_type: "escalate_to_admin",
  });

  const handleAdd = () => {
    if (!workspaceId || !newRule.name.trim()) return;
    upsertRule.mutate({
      workspace_id: workspaceId,
      ...newRule,
    });
    setShowAdd(false);
    setNewRule({ name: "", trigger_type: "sla_breach", trigger_minutes: 30, action_type: "escalate_to_admin" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-destructive" /> Escalation Rules
        </CardTitle>
        <CardDescription>Auto-escalate when SLAs are breached or threads go unresponded</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(rules ?? []).map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-medium">{rule.name}</p>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[10px]">{rule.trigger_type}</Badge>
                <Badge variant="secondary" className="text-[10px]">{rule.trigger_minutes}min</Badge>
                <Badge className="text-[10px] bg-primary/10 text-primary">{rule.action_type}</Badge>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={() => deleteRule.mutate(rule.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {showAdd ? (
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <Input placeholder="Rule name" value={newRule.name} onChange={(e) => setNewRule(p => ({ ...p, name: e.target.value }))} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={newRule.trigger_type} onValueChange={(v) => setNewRule(p => ({ ...p, trigger_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sla_breach">SLA Breach</SelectItem>
                  <SelectItem value="no_response">No Response</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" value={newRule.trigger_minutes} onChange={(e) => setNewRule(p => ({ ...p, trigger_minutes: +e.target.value }))} min={1} />
              <Select value={newRule.action_type} onValueChange={(v) => setNewRule(p => ({ ...p, action_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reassign">Reassign</SelectItem>
                  <SelectItem value="escalate_to_admin">Escalate to Admin</SelectItem>
                  <SelectItem value="notify">Notify Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={!newRule.name.trim()}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Rule
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
