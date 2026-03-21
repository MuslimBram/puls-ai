import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { usePublicApi, useZapierWebhooks } from "@/hooks/usePublicApi";
import { Key, Webhook, Activity, Copy, Trash2, Plus, Shield, Code, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const ZAPIER_EVENTS = [
  { value: "lead.created", label: "Lead Created" },
  { value: "message.received", label: "Message Received" },
  { value: "deal.updated", label: "Deal Updated" },
  { value: "automation.triggered", label: "Automation Triggered" },
];

const PublicApiPage = () => {
  const { keys, logs, isLoading, createKey, revokeKey } = usePublicApi();
  const { webhooks, addWebhook, removeWebhook, toggleWebhook } = useZapierWebhooks();
  const { toast } = useToast();

  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>(["read", "write"]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("lead.created");
  const [newWebhookLabel, setNewWebhookLabel] = useState("");

  const baseUrl = `${window.location.origin.replace("id-preview--", "").replace(".lovable.app", ".supabase.co")}/functions/v1/public-api`;

  const handleCreateKey = async () => {
    const result = await createKey.mutateAsync({ label: newKeyLabel || "Default", permissions: newKeyPerms });
    setCreatedKey(result.raw_key);
    setNewKeyLabel("");
  };

  const handleAddWebhook = () => {
    if (!newWebhookUrl) return;
    addWebhook.mutate({ webhook_url: newWebhookUrl, event_type: newWebhookEvent, label: newWebhookLabel });
    setNewWebhookUrl("");
    setNewWebhookLabel("");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Public API & Integrations</h1>
          <p className="text-muted-foreground">Manage API keys, webhooks, and Zapier integrations</p>
        </div>

        <Tabs defaultValue="keys">
          <TabsList>
            <TabsTrigger value="keys"><Key className="h-4 w-4 mr-1" /> API Keys</TabsTrigger>
            <TabsTrigger value="zapier"><Webhook className="h-4 w-4 mr-1" /> Zapier Webhooks</TabsTrigger>
            <TabsTrigger value="logs"><Activity className="h-4 w-4 mr-1" /> Request Logs</TabsTrigger>
            <TabsTrigger value="docs"><BookOpen className="h-4 w-4 mr-1" /> API Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="keys" className="space-y-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Authenticate external requests to your Pulse AI data</CardDescription>
                </div>
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setCreatedKey(null); setShowCreateDialog(true); }}>
                      <Plus className="h-4 w-4 mr-1" /> Create Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{createdKey ? "Key Created!" : "Create API Key"}</DialogTitle>
                    </DialogHeader>
                    {createdKey ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Copy this key now — it won't be shown again.</p>
                        <div className="flex gap-2">
                          <Input value={createdKey} readOnly className="font-mono text-xs" />
                          <Button variant="outline" size="icon" onClick={() => copyToClipboard(createdKey)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <DialogFooter>
                          <Button onClick={() => setShowCreateDialog(false)}>Done</Button>
                        </DialogFooter>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <Label>Label</Label>
                          <Input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="My Integration" />
                        </div>
                        <div className="space-y-2">
                          <Label>Permissions</Label>
                          {["read", "write", "admin"].map(perm => (
                            <div key={perm} className="flex items-center gap-2">
                              <Checkbox
                                checked={newKeyPerms.includes(perm)}
                                onCheckedChange={(checked) => {
                                  setNewKeyPerms(prev => checked ? [...prev, perm] : prev.filter(p => p !== perm));
                                }}
                              />
                              <span className="capitalize text-sm">{perm}</span>
                            </div>
                          ))}
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateKey} disabled={createKey.isPending}>
                            {createKey.isPending ? "Creating..." : "Create"}
                          </Button>
                        </DialogFooter>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map(key => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.label}</TableCell>
                        <TableCell className="font-mono text-xs">{key.key_prefix}</TableCell>
                        <TableCell>
                          {key.permissions.map(p => (
                            <Badge key={p} variant="outline" className="mr-1 text-xs">{p}</Badge>
                          ))}
                        </TableCell>
                        <TableCell>{key.usage_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {key.last_used_at ? format(new Date(key.last_used_at), "MMM d, HH:mm") : "Never"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.is_active ? "default" : "secondary"}>
                            {key.is_active ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {key.is_active && (
                            <Button variant="ghost" size="icon" onClick={() => revokeKey.mutate(key.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {keys.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No API keys yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="zapier" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Zapier / Make Webhooks</CardTitle>
                <CardDescription>Fire webhooks to external services when events happen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." className="flex-1 min-w-[250px]" />
                  <Select value={newWebhookEvent} onValueChange={setNewWebhookEvent}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ZAPIER_EVENTS.map(ev => <SelectItem key={ev.value} value={ev.value}>{ev.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={newWebhookLabel} onChange={e => setNewWebhookLabel(e.target.value)} placeholder="Label (optional)" className="w-[150px]" />
                  <Button onClick={handleAddWebhook} disabled={!newWebhookUrl}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Triggers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((wh: any) => (
                      <TableRow key={wh.id}>
                        <TableCell>{wh.label || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{wh.event_type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">{wh.webhook_url}</TableCell>
                        <TableCell>{wh.trigger_count}</TableCell>
                        <TableCell>
                          <Badge variant={wh.is_active ? "default" : "secondary"} className="cursor-pointer"
                            onClick={() => toggleWebhook.mutate({ id: wh.id, is_active: !wh.is_active })}>
                            {wh.is_active ? "Active" : "Paused"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeWebhook.mutate(wh.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {webhooks.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No webhooks configured</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Request Logs</CardTitle>
                <CardDescription>Recent API calls (last 100)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{format(new Date(log.created_at), "MMM d, HH:mm:ss")}</TableCell>
                        <TableCell><Badge variant="outline">{log.method}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                        <TableCell>
                          <Badge variant={log.status_code < 400 ? "default" : "destructive"}>{log.status_code}</Badge>
                        </TableCell>
                        <TableCell>{log.response_time_ms}ms</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.ip_address || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No requests yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" /> API Reference</CardTitle>
                <CardDescription>Use these endpoints with your API key</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium">Base URL</p>
                  <div className="flex gap-2 items-center">
                    <code className="bg-background px-3 py-1.5 rounded text-xs font-mono flex-1 overflow-x-auto">
                      {`https://oazqhnibgfkuiuczzikq.supabase.co/functions/v1/public-api`}
                    </code>
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(`https://oazqhnibgfkuiuczzikq.supabase.co/functions/v1/public-api`)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Include header: <code>x-api-key: your_key</code></p>
                </div>

                {[
                  { method: "GET", path: "?resource=leads", desc: "List leads (limit, offset params)" },
                  { method: "POST", path: "?resource=leads", desc: "Create lead", body: '{ "name": "...", "email": "...", "phone": "...", "source": "api" }' },
                  { method: "GET", path: "?resource=messages", desc: "List messages" },
                  { method: "POST", path: "?resource=messages", desc: "Send/log message", body: '{ "channel": "api", "sender_name": "...", "message": "..." }' },
                  { method: "GET", path: "?resource=deals", desc: "List deals" },
                  { method: "PUT", path: "?resource=deals", desc: "Update deal", body: '{ "id": "deal-uuid", "status": "won", "value": 1000 }' },
                  { method: "POST", path: "?resource=automations", desc: "Trigger automation", body: '{ "workflow_id": "uuid", "metadata": {} }' },
                  { method: "GET", path: "?resource=analytics", desc: "Get analytics summary (days param)" },
                ].map((ep, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={ep.method === "GET" ? "secondary" : "default"} className="font-mono text-xs">{ep.method}</Badge>
                      <code className="text-xs font-mono">{ep.path}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">{ep.desc}</p>
                    {ep.body && (
                      <pre className="bg-muted rounded p-2 text-xs font-mono overflow-x-auto">{ep.body}</pre>
                    )}
                  </div>
                ))}

                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm font-medium mb-2 flex items-center gap-2"><Shield className="h-4 w-4" /> Zapier / Make Connector</p>
                  <p className="text-sm text-muted-foreground">
                    Create a Zap → Webhook trigger → paste your webhook URL in the "Zapier Webhooks" tab above.
                    Events are fired automatically for: lead.created, message.received, deal.updated, automation.triggered
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PublicApiPage;
