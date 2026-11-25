import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import {
  Plus, Copy, Trash2, TestTube, Send, RefreshCw, ExternalLink, Pencil, WifiOff, Wifi,
  AlertTriangle, CheckCircle2, Eye, EyeOff,
} from "lucide-react";
import { format } from "date-fns";

interface MappingPair { key: string; value: string; }

const generateKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 8);

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-webhook`;

const isValidUrl = (url: string): boolean => {
  try { new URL(url); return true; } catch { return false; }
};

export const AdminCustomChannelPanel = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const workspaceQuery = useQuery({
    queryKey: ["my-workspace-id", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      if (error) throw error;
      return data.workspace_id as string;
    },
    enabled: !!user,
  });
  const workspaceId = workspaceQuery.data ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Form state
  const [name, setName] = useState("");
  const [adapterKey, setAdapterKey] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const [authType, setAuthType] = useState("none");
  const [authCreds, setAuthCreds] = useState<Record<string, string>>({});
  const [inboundPairs, setInboundPairs] = useState<MappingPair[]>([
    { key: "text", value: "message_content" },
    { key: "from", value: "sender_name" },
    { key: "sender_id", value: "sender_identifier" },
  ]);
  const [outboundPairs, setOutboundPairs] = useState<MappingPair[]>([
    { key: "message_content", value: "text" },
    { key: "recipient_identifier", value: "to" },
  ]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Test state
  const [testPayload, setTestPayload] = useState('{"text":"Hello from test","from":"Test User","sender_id":"test-123"}');
  const [testOutMsg, setTestOutMsg] = useState("Hello from Pulse AI");
  const [testOutRecipient, setTestOutRecipient] = useState("test-recipient");
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const adaptersQuery = useQuery({
    queryKey: ["custom-channel-adapters", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("custom-channel-admin", {
        body: { action: "list", workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.adapters ?? []) as any[];
    },
    enabled: !!workspaceId,
  });

  const eventLogsQuery = useQuery({
    queryKey: ["integration-event-logs-custom", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("custom-channel-admin", {
        body: { action: "list_logs", workspace_id: workspaceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.logs ?? []) as any[];
    },
    enabled: !!workspaceId,
  });

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Adapter name is required";
    if (!adapterKey.trim()) errors.adapterKey = "Adapter key is required";
    if (!/^[a-z0-9-]+$/.test(adapterKey)) errors.adapterKey = "Key must contain only lowercase letters, numbers, and hyphens";

    // Duplicate key check (only for new adapters)
    if (!editId) {
      const existing = (adaptersQuery.data || []).find((a: any) => a.adapter_key === adapterKey);
      if (existing) errors.adapterKey = "This adapter key already exists. Choose a unique key.";
    }

    if (providerUrl && !isValidUrl(providerUrl)) errors.providerUrl = "Invalid URL format. Must start with http:// or https://";

    if (authType === "bearer" && !authCreds.token) errors.auth = "Bearer token is required";
    if (authType === "basic" && (!authCreds.username || !authCreds.password)) errors.auth = "Username and password are required";
    if (authType === "api_key" && (!authCreds.header_name || !authCreds.api_key)) errors.auth = "Header name and API key are required";

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validateForm()) throw new Error("Fix form errors before saving");
      if (!workspaceId) throw new Error("Workspace not loaded");

      const inboundMapping: Record<string, string> = {};
      inboundPairs.forEach(p => { if (p.key && p.value) inboundMapping[p.key] = p.value; });
      const outboundMapping: Record<string, string> = {};
      outboundPairs.forEach(p => { if (p.key && p.value) outboundMapping[p.key] = p.value; });

      const { data, error } = await supabase.functions.invoke("custom-channel-admin", {
        body: {
          action: "upsert",
          workspace_id: workspaceId,
          ...(editId ? { id: editId } : {}),
          adapter_name: name.trim(),
          adapter_key: adapterKey.trim(),
          provider_api_url: providerUrl.trim() || null,
          auth_type: authType,
          auth_credentials: authCreds,
          inbound_mapping: inboundMapping,
          outbound_mapping: outboundMapping,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters", workspaceId] });
      toast.success(editId ? "Adapter updated" : "Adapter created");
      resetForm();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data, error } = await supabase.functions.invoke("custom-channel-admin", {
        body: { action: "toggle", workspace_id: workspaceId, id, is_active: active },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters", workspaceId] });
      toast.success("Adapter status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("custom-channel-admin", {
        body: { action: "delete", workspace_id: workspaceId, id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters", workspaceId] });
      toast.success("Adapter deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setName("");
    setAdapterKey("");
    setProviderUrl("");
    setAuthType("none");
    setAuthCreds({});
    setFormErrors({});
    setInboundPairs([
      { key: "text", value: "message_content" },
      { key: "from", value: "sender_name" },
      { key: "sender_id", value: "sender_identifier" },
    ]);
    setOutboundPairs([
      { key: "message_content", value: "text" },
      { key: "recipient_identifier", value: "to" },
    ]);
  };

  const openEdit = (adapter: any) => {
    setEditId(adapter.id);
    setName(adapter.adapter_name);
    setAdapterKey(adapter.adapter_key);
    setProviderUrl(adapter.provider_api_url || "");
    setAuthType(adapter.auth_type || "none");
    // Mask credentials on edit - show empty, user must re-enter to change
    setAuthCreds({});
    const inMap = adapter.inbound_mapping || {};
    setInboundPairs(Object.entries(inMap).map(([key, value]) => ({ key, value: value as string })));
    const outMap = adapter.outbound_mapping || {};
    setOutboundPairs(Object.entries(outMap).map(([key, value]) => ({ key, value: value as string })));
    setFormErrors({});
    setDialogOpen(true);
  };

  // Test connection - validates provider API URL is reachable
  const testConnection = async (adapter: any) => {
    if (!adapter.provider_api_url) {
      toast.error("No provider API URL configured");
      return;
    }
    setTestingConnection(adapter.id);
    try {
      // Try a HEAD/OPTIONS request to check reachability
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(adapter.provider_api_url, {
        method: "OPTIONS",
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeout);

      if (res && (res.status < 500)) {
        toast.success(`Connection OK — provider responded with status ${res.status}`);
      } else {
        toast.error("Provider unreachable or returned server error");
      }
    } catch (e: any) {
      toast.error(`Connection test failed: ${e.message || "Timeout or network error"}`);
    } finally {
      setTestingConnection(null);
    }
  };

  const testInbound = async (key: string) => {
    try {
      const payload = JSON.parse(testPayload);
      const res = await fetch(`${WEBHOOK_BASE}?adapter=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["integration-event-logs-custom", workspaceId] });
      if (data.success) {
        toast.success(`Inbound test OK — message_id: ${data.message_id}`);
      } else {
        toast.error(`Inbound test failed: ${data.error}`);
      }
    } catch (e: any) {
      toast.error(`Test error: ${e.message}`);
    }
  };

  const testOutbound = async (key: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("custom-channel-send", {
        body: { adapter_key: key, message_content: testOutMsg, recipient_identifier: testOutRecipient },
      });
      queryClient.invalidateQueries({ queryKey: ["integration-event-logs-custom", workspaceId] });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Outbound test OK — provider status: ${data.provider_status}`);
      } else {
        toast.error(`Outbound failed: ${JSON.stringify(data?.provider_response || data?.error)}`);
      }
    } catch (e: any) {
      toast.error(`Test error: ${e.message}`);
    }
  };

  const copyWebhookUrl = (key: string) => {
    navigator.clipboard.writeText(`${WEBHOOK_BASE}?adapter=${key}`);
    toast.success("Webhook URL copied");
  };

  const adapters = adaptersQuery.data || [];
  const eventLogs = eventLogsQuery.data || [];

  const MappingEditor = ({ pairs, setPairs, label }: { pairs: MappingPair[]; setPairs: (p: MappingPair[]) => void; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {pairs.map((pair, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Input placeholder="Provider field" value={pair.key} onChange={e => { const n = [...pairs]; n[i].key = e.target.value; setPairs(n); }} className="flex-1" />
          <span className="text-muted-foreground">→</span>
          <Input placeholder="Pulse field" value={pair.value} onChange={e => { const n = [...pairs]; n[i].value = e.target.value; setPairs(n); }} className="flex-1" />
          <Button aria-label="Delete" variant="ghost" size="icon" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setPairs([...pairs, { key: "", value: "" }])}><Plus className="h-3 w-3 mr-1" /> Add Field</Button>
    </div>
  );

  const FieldError = ({ field }: { field: string }) => {
    if (!formErrors[field]) return null;
    return <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{formErrors[field]}</p>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Custom Channel Adapters</h3>
          <p className="text-sm text-muted-foreground">Connect any external messaging provider to Pulse AI inbox</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetForm(); setDialogOpen(v); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-1" /> New Adapter</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Adapter" : "Create Adapter"}</DialogTitle>
              <DialogDescription>
                {editId ? "Update adapter configuration. Leave credential fields empty to keep existing values." : "Configure a new custom channel adapter to connect an external provider."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Adapter Name <span className="text-destructive">*</span></Label>
                  <Input value={name} onChange={e => { setName(e.target.value); if (!editId) setAdapterKey(generateKey(e.target.value)); }} placeholder="My Provider" />
                  <FieldError field="name" />
                </div>
                <div>
                  <Label>Adapter Key <span className="text-destructive">*</span></Label>
                  <Input value={adapterKey} onChange={e => setAdapterKey(e.target.value)} placeholder="my-provider-abc123" disabled={!!editId} />
                  <FieldError field="adapterKey" />
                  {editId && <p className="text-xs text-muted-foreground mt-1">Key cannot be changed after creation</p>}
                </div>
              </div>

              {/* API Config */}
              <div>
                <Label>Provider API URL (for outbound)</Label>
                <Input value={providerUrl} onChange={e => setProviderUrl(e.target.value)} placeholder="https://api.provider.com/send" />
                <FieldError field="providerUrl" />
              </div>

              {/* Auth */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Auth Type</Label>
                  <Select value={authType} onValueChange={setAuthType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="api_key">API Key Header</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {authType === "bearer" && (
                    <>
                      <Label>Token</Label>
                      <Input type="password" value={authCreds.token || ""} onChange={e => setAuthCreds({ ...authCreds, token: e.target.value })} placeholder={editId ? "••••••• (leave empty to keep)" : ""} />
                    </>
                  )}
                  {authType === "basic" && (
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input value={authCreds.username || ""} onChange={e => setAuthCreds({ ...authCreds, username: e.target.value })} />
                      <Label>Password</Label>
                      <Input type="password" value={authCreds.password || ""} onChange={e => setAuthCreds({ ...authCreds, password: e.target.value })} placeholder={editId ? "••••••• (leave empty to keep)" : ""} />
                    </div>
                  )}
                  {authType === "api_key" && (
                    <div className="space-y-2">
                      <Label>Header Name</Label>
                      <Input value={authCreds.header_name || ""} onChange={e => setAuthCreds({ ...authCreds, header_name: e.target.value })} placeholder="X-API-Key" />
                      <Label>API Key</Label>
                      <Input type="password" value={authCreds.api_key || ""} onChange={e => setAuthCreds({ ...authCreds, api_key: e.target.value })} placeholder={editId ? "••••••• (leave empty to keep)" : ""} />
                    </div>
                  )}
                  <FieldError field="auth" />
                </div>
              </div>

              {/* Mappings */}
              <MappingEditor pairs={inboundPairs} setPairs={setInboundPairs} label="Inbound Mapping (Provider → Pulse)" />
              <MappingEditor pairs={outboundPairs} setPairs={setOutboundPairs} label="Outbound Mapping (Pulse → Provider)" />

              <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={!name || !adapterKey || saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editId ? "Update Adapter" : "Create Adapter"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Adapters List */}
      {adapters.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No custom channel adapters yet. Create one to get started.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {adapters.map((a: any) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{a.adapter_name}</CardTitle>
                    <Badge variant={a.is_active ? "default" : "secondary"} className="gap-1">
                      {a.is_active ? <><Wifi className="h-3 w-3" /> Active</> : <><WifiOff className="h-3 w-3" /> Disabled</>}
                    </Badge>
                    <Badge variant="outline">{a.auth_type}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: a.id, active: v })} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => testConnection(a)}
                      disabled={testingConnection === a.id || !a.provider_api_url}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {testingConnection === a.id ? "Testing..." : "Test Connection"}
                    </Button>
                    <Button aria-label="Delete" variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: a.id, name: a.adapter_name })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription>Key: <code className="bg-muted px-1 rounded text-xs">{a.adapter_key}</code></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Webhook URL */}
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <code className="text-xs flex-1 truncate">{WEBHOOK_BASE}?adapter={a.adapter_key}</code>
                  <Button aria-label="Copy" variant="ghost" size="icon" onClick={() => copyWebhookUrl(a.adapter_key)}><Copy className="h-3 w-3" /></Button>
                </div>

                {a.provider_api_url && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Provider: {a.provider_api_url}
                  </p>
                )}

                {/* Auth info (masked) */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Auth: {a.auth_type}</span>
                  {a.auth_type !== "none" && (
                    <Button aria-label="Show or hide" variant="ghost" size="sm" className="h-5 px-1" onClick={() => setShowSecrets(s => ({ ...s, [a.id]: !s[a.id] }))}>
                      {showSecrets[a.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  )}
                  {a.auth_type !== "none" && (
                    <span>{showSecrets[a.id] ? JSON.stringify(a.auth_credentials) : "••••••• (credentials hidden)"}</span>
                  )}
                </div>

                {/* Test Buttons */}
                <Tabs defaultValue="inbound" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="inbound"><TestTube className="h-3 w-3 mr-1" /> Test Inbound</TabsTrigger>
                    <TabsTrigger value="outbound"><Send className="h-3 w-3 mr-1" /> Test Outbound</TabsTrigger>
                  </TabsList>
                  <TabsContent value="inbound" className="space-y-2">
                    <textarea
                      className="w-full text-xs font-mono border rounded p-2 bg-background min-h-[60px]"
                      value={testPayload}
                      onChange={e => setTestPayload(e.target.value)}
                    />
                    <Button size="sm" onClick={() => testInbound(a.adapter_key)}><TestTube className="h-3 w-3 mr-1" /> Send Test Inbound</Button>
                  </TabsContent>
                  <TabsContent value="outbound" className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Message" value={testOutMsg} onChange={e => setTestOutMsg(e.target.value)} className="text-xs" />
                      <Input placeholder="Recipient" value={testOutRecipient} onChange={e => setTestOutRecipient(e.target.value)} className="text-xs" />
                    </div>
                    <Button size="sm" onClick={() => testOutbound(a.adapter_key)} disabled={!a.provider_api_url}>
                      <Send className="h-3 w-3 mr-1" /> Send Test Outbound
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Adapter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
              Activity logs for this adapter will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Adapter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activity Log */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Activity Log</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["integration-event-logs-custom"] })}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {eventLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No events yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Adapter</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventLogs.slice(0, 30).map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{log.created_at ? format(new Date(log.created_at), "MMM d HH:mm:ss") : "-"}</TableCell>
                    <TableCell className="text-xs"><code>{log.adapter_key || "-"}</code></TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.event_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-xs">{log.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{log.event_message || JSON.stringify(log.metadata || {})}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
