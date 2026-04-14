import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnifiedConnections, useConnectionLogs } from "@/hooks/useUnifiedConnections";
import { useN8nConfig } from "@/hooks/useN8nConfig";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Plug, Activity, Webhook, TestTube, Trash2, RefreshCw, Plus } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const AdminIntegrationHub = () => {
  const { user } = useAuth();
  const { permissions } = useRolePermissions();

  // Get workspace
  const { data: workspace } = useQuery({
    queryKey: ["user-workspace", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("owner_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integration Hub</h1>
        <p className="text-muted-foreground">Manage all platform connections, n8n workflows, and logs</p>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections"><Plug className="h-4 w-4 mr-1" /> Connections</TabsTrigger>
          <TabsTrigger value="n8n"><Webhook className="h-4 w-4 mr-1" /> n8n</TabsTrigger>
          <TabsTrigger value="logs"><Activity className="h-4 w-4 mr-1" /> Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <ConnectionsPanel />
        </TabsContent>
        <TabsContent value="n8n">
          <N8nPanel workspaceId={workspace?.id} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const PROVIDERS = [
  { key: "telegram", name: "Telegram", category: "messaging", types: ["bot_token"] },
  { key: "twilio", name: "Twilio / WhatsApp", category: "messaging", types: ["api_key", "credentials"] },
  { key: "openai", name: "OpenAI", category: "ai", types: ["api_key"] },
  { key: "n8n", name: "n8n", category: "automation", types: ["api_key", "webhook"] },
];

const ConnectionsPanel = () => {
  const { connections, isLoading, addConnection, testConnection, deleteConnection } = useUnifiedConnections();
  const [showAdd, setShowAdd] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newProvider || !newType) return;
    const prov = PROVIDERS.find((p) => p.key === newProvider);
    addConnection.mutate({
      provider: newProvider,
      category: prov?.category || "general",
      connection_type: newType,
      display_name: newName || prov?.name || newProvider,
    });
    setShowAdd(false);
    setNewProvider("");
    setNewType("");
    setNewName("");
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "connected": return "default";
      case "error": return "destructive";
      case "expired": return "destructive";
      case "disconnected": return "secondary";
      default: return "outline";
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Unified Connections</CardTitle>
          <CardDescription>All provider connections in one place</CardDescription>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> Add Connection
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Provider</Label>
                  <Select value={newProvider} onValueChange={(v) => { setNewProvider(v); setNewType(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Connection Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {(PROVIDERS.find((p) => p.key === newProvider)?.types || []).map((t) => (
                        <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Display Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <Button size="sm" onClick={handleAdd} disabled={!newProvider || !newType}>
                Create Connection
              </Button>
            </CardContent>
          </Card>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Tested</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : connections.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No connections yet</TableCell></TableRow>
            ) : (
              connections.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.display_name || c.provider}</TableCell>
                  <TableCell><Badge variant="outline">{c.connection_type}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={statusColor(c.status) as any}>{c.status}</Badge>
                    {c.last_error && <p className="text-xs text-destructive mt-1">{c.last_error}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.last_tested_at ? format(new Date(c.last_tested_at), "dd/MM HH:mm") : "Never"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => testConnection.mutate(c.id)} title="Test">
                        <TestTube className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteConnection.mutate(c.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

const N8nPanel = ({ workspaceId }: { workspaceId?: string }) => {
  const { config, isLoading, saveConfig, testConnection } = useN8nConfig(workspaceId);
  const [baseUrl, setBaseUrl] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({
    new_lead: "",
    new_message: "",
    form_submit: "",
    payment_success: "",
  });

  const handleSave = () => {
    saveConfig.mutate({
      base_url: baseUrl || config?.base_url || "",
      event_mappings: Object.fromEntries(
        Object.entries(mappings).map(([k, v]) => [k, v || null])
      ),
    });
  };

  // Sync from config
  const url = baseUrl || config?.base_url || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>n8n Workflow Automation</CardTitle>
        <CardDescription>
          Connect your n8n instance to trigger workflows on platform events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!workspaceId ? (
          <p className="text-muted-foreground">No workspace found</p>
        ) : (
          <>
            <div className="grid gap-3">
              <div>
                <Label>n8n Base URL</Label>
                <Input
                  value={url}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-n8n.example.com"
                />
              </div>

              {config && (
                <div className="flex items-center gap-2">
                  <Badge variant={config.status === "connected" ? "default" : "destructive"}>
                    {config.status}
                  </Badge>
                  {config.last_tested_at && (
                    <span className="text-xs text-muted-foreground">
                      Tested: {format(new Date(config.last_tested_at), "dd/MM HH:mm")}
                    </span>
                  )}
                  {config.last_error && (
                    <span className="text-xs text-destructive">{config.last_error}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold">Event → Workflow Mappings</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Enter the n8n webhook URL for each event type
              </p>
              <div className="grid gap-2">
                {["new_lead", "new_message", "form_submit", "payment_success"].map((event) => (
                  <div key={event} className="flex items-center gap-2">
                    <Label className="w-36 text-sm">{event.replace("_", " ")}</Label>
                    <Input
                      value={mappings[event] || (config?.event_mappings as any)?.[event] || ""}
                      onChange={(e) => setMappings((m) => ({ ...m, [event]: e.target.value }))}
                      placeholder="https://n8n.example.com/webhook/..."
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saveConfig.isPending}>
                Save Configuration
              </Button>
              <Button
                variant="outline"
                onClick={() => testConnection.mutate()}
                disabled={testConnection.isPending || !config}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Test Connection
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const LogsPanel = () => {
  const { data: logs = [], isLoading } = useConnectionLogs();

  const eventIcon = (type: string) => {
    if (type.includes("error")) return "🔴";
    if (type.includes("test")) return "🧪";
    if (type.includes("created")) return "🟢";
    if (type.includes("deleted")) return "🗑️";
    return "📋";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection & Webhook Logs</CardTitle>
        <CardDescription>Recent activity across all integrations</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No logs yet. Activity will appear here once connections are used.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-2 rounded border">
                <span>{eventIcon(log.event_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{log.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")} · {log.event_type}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminIntegrationHub;
