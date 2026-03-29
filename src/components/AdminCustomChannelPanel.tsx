import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { Plus, Copy, Trash2, TestTube, Send, RefreshCw, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface MappingPair { key: string; value: string; }

const generateKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 8);

const WEBHOOK_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-webhook`;

export const AdminCustomChannelPanel = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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

  // Test state
  const [testPayload, setTestPayload] = useState('{"text":"Hello from test","from":"Test User","sender_id":"test-123"}');
  const [testOutMsg, setTestOutMsg] = useState("Hello from Pulse AI");
  const [testOutRecipient, setTestOutRecipient] = useState("test-recipient");

  const adaptersQuery = useQuery({
    queryKey: ["custom-channel-adapters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_channel_adapters" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const eventLogsQuery = useQuery({
    queryKey: ["integration-event-logs-custom"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_event_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const inboundMapping: Record<string, string> = {};
      inboundPairs.forEach(p => { if (p.key && p.value) inboundMapping[p.key] = p.value; });
      const outboundMapping: Record<string, string> = {};
      outboundPairs.forEach(p => { if (p.key && p.value) outboundMapping[p.key] = p.value; });

      const payload = {
        adapter_name: name,
        adapter_key: adapterKey,
        provider_api_url: providerUrl || null,
        auth_type: authType,
        auth_credentials: authCreds,
        inbound_mapping: inboundMapping,
        outbound_mapping: outboundMapping,
      } as any;

      if (editId) {
        const { error } = await supabase.from("custom_channel_adapters" as any).update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        // Get user's workspace
        const { data: wm } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", user!.id).limit(1).single();
        const { error } = await supabase.from("custom_channel_adapters" as any).insert({
          ...payload,
          workspace_id: wm?.workspace_id,
          created_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters"] });
      toast.success(editId ? "Adapter updated" : "Adapter created");
      resetForm();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("custom_channel_adapters" as any).update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_channel_adapters" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-channel-adapters"] });
      toast.success("Adapter deleted");
    },
  });

  const resetForm = () => {
    setEditId(null);
    setName("");
    setAdapterKey("");
    setProviderUrl("");
    setAuthType("none");
    setAuthCreds({});
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
    setAuthCreds(adapter.auth_credentials || {});
    const inMap = adapter.inbound_mapping || {};
    setInboundPairs(Object.entries(inMap).map(([key, value]) => ({ key, value: value as string })));
    const outMap = adapter.outbound_mapping || {};
    setOutboundPairs(Object.entries(outMap).map(([key, value]) => ({ key, value: value as string })));
    setDialogOpen(true);
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
          <Button variant="ghost" size="icon" onClick={() => setPairs(pairs.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setPairs([...pairs, { key: "", value: "" }])}><Plus className="h-3 w-3 mr-1" /> Add</Button>
    </div>
  );

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
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Adapter Name</Label>
                  <Input value={name} onChange={e => { setName(e.target.value); if (!editId) setAdapterKey(generateKey(e.target.value)); }} placeholder="My Provider" />
                </div>
                <div>
                  <Label>Adapter Key</Label>
                  <Input value={adapterKey} onChange={e => setAdapterKey(e.target.value)} placeholder="my-provider-abc123" />
                </div>
              </div>

              <div>
                <Label>Provider API URL (for outbound)</Label>
                <Input value={providerUrl} onChange={e => setProviderUrl(e.target.value)} placeholder="https://api.provider.com/send" />
              </div>

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
                    <><Label>Token</Label><Input type="password" value={authCreds.token || ""} onChange={e => setAuthCreds({ ...authCreds, token: e.target.value })} /></>
                  )}
                  {authType === "basic" && (
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input value={authCreds.username || ""} onChange={e => setAuthCreds({ ...authCreds, username: e.target.value })} />
                      <Label>Password</Label>
                      <Input type="password" value={authCreds.password || ""} onChange={e => setAuthCreds({ ...authCreds, password: e.target.value })} />
                    </div>
                  )}
                  {authType === "api_key" && (
                    <div className="space-y-2">
                      <Label>Header Name</Label>
                      <Input value={authCreds.header_name || ""} onChange={e => setAuthCreds({ ...authCreds, header_name: e.target.value })} placeholder="X-API-Key" />
                      <Label>API Key</Label>
                      <Input type="password" value={authCreds.api_key || ""} onChange={e => setAuthCreds({ ...authCreds, api_key: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>

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
                    <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "Active" : "Inactive"}</Badge>
                    <Badge variant="outline">{a.auth_type}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: a.id, active: v })} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
                <CardDescription>Key: <code className="bg-muted px-1 rounded text-xs">{a.adapter_key}</code></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Webhook URL */}
                <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                  <code className="text-xs flex-1 truncate">{WEBHOOK_BASE}?adapter={a.adapter_key}</code>
                  <Button variant="ghost" size="icon" onClick={() => copyWebhookUrl(a.adapter_key)}><Copy className="h-3 w-3" /></Button>
                </div>

                {a.provider_api_url && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Provider: {a.provider_api_url}
                  </p>
                )}

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
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventLogs.slice(0, 20).map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{log.created_at ? format(new Date(log.created_at), "MMM d HH:mm:ss") : "-"}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{log.event_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={log.status === "success" ? "default" : "destructive"} className="text-xs">{log.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{JSON.stringify(log.metadata || {})}</TableCell>
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
