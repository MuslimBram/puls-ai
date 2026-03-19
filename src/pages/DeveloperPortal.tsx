import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePublicApi, useZapierWebhooks } from "@/hooks/usePublicApi";
import { Code, Key, Webhook, BarChart3, TestTube } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DeveloperPortal = () => {
  const { keys, logs, isLoading, createKey, revokeKey } = usePublicApi();
  const { webhooks, addWebhook, removeWebhook, toggleWebhook } = useZapierWebhooks();
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvent, setWebhookEvent] = useState("message.received");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Code className="h-6 w-6 text-primary" /> Developer Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">API keys, webhooks, usage analytics, and sandbox testing</p>
        </div>

        <Tabs defaultValue="api-keys">
          <TabsList>
            <TabsTrigger value="api-keys" className="gap-1"><Key className="h-3 w-3" />API Keys</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1"><Webhook className="h-3 w-3" />Webhooks</TabsTrigger>
            <TabsTrigger value="usage" className="gap-1"><BarChart3 className="h-3 w-3" />Usage</TabsTrigger>
            <TabsTrigger value="sandbox" className="gap-1"><TestTube className="h-3 w-3" />Sandbox</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Create API Key</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Input placeholder="Key label" value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} className="max-w-xs" />
                <Button size="sm" onClick={() => { createKey.mutate({ label: newKeyLabel, permissions: ["read", "write"] }); setNewKeyLabel(""); }} disabled={!newKeyLabel}>Create</Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {keys.map((k) => (
                <Card key={k.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{k.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}••••••••</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={k.is_active ? "default" : "secondary"}>{k.is_active ? "Active" : "Revoked"}</Badge>
                      <span className="text-xs text-muted-foreground">{k.usage_count} calls</span>
                      {k.is_active && <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => revokeKey.mutate(k.id)}>Revoke</Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {keys.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No API keys created yet.</p>}
            </div>
          </TabsContent>

          <TabsContent value="webhooks" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Add Webhook</CardTitle></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                <Input placeholder="https://..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="max-w-md" />
                <Select value={webhookEvent} onValueChange={setWebhookEvent}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message.received">Message Received</SelectItem>
                    <SelectItem value="lead.created">Lead Created</SelectItem>
                    <SelectItem value="deal.updated">Deal Updated</SelectItem>
                    <SelectItem value="call.completed">Call Completed</SelectItem>
                    <SelectItem value="campaign.sent">Campaign Sent</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => { addWebhook.mutate({ webhook_url: webhookUrl, event_type: webhookEvent }); setWebhookUrl(""); }}>Add</Button>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {webhooks.map((wh: any) => (
                <Card key={wh.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-mono">{wh.webhook_url}</p>
                      <Badge variant="outline" className="text-[10px]">{wh.event_type}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => removeWebhook.mutate(wh.id)}>Remove</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="usage" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">API Usage</CardTitle>
                <CardDescription>Recent API request logs</CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No API requests logged yet.</p>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {logs.slice(0, 50).map((l) => (
                      <div key={l.id} className="flex items-center gap-3 text-xs py-1 border-b border-border/50">
                        <Badge variant={l.status_code < 400 ? "default" : "destructive"} className="text-[10px] w-10 justify-center">{l.status_code}</Badge>
                        <span className="font-mono">{l.method}</span>
                        <span className="flex-1 truncate text-muted-foreground">{l.endpoint}</span>
                        <span className="text-muted-foreground">{l.response_time_ms}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sandbox" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><TestTube className="h-4 w-4" /> Sandbox Environment</CardTitle>
                <CardDescription>Test your integrations without affecting live data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <TestTube className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">API Sandbox</p>
                  <p className="text-xs text-muted-foreground mt-1">Use sandbox API keys to test endpoints with mock data</p>
                  <Button size="sm" className="mt-3" onClick={() => createKey.mutate({ label: "Sandbox Key", permissions: ["read", "write", "sandbox"] })}>Create Sandbox Key</Button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium">Base URL</p>
                    <code className="text-[10px] text-muted-foreground break-all">https://{"{project-id}"}.supabase.co/functions/v1/public-api</code>
                  </div>
                  <div className="rounded-md bg-muted/50 p-3">
                    <p className="text-xs font-medium">Auth Header</p>
                    <code className="text-[10px] text-muted-foreground">Authorization: Bearer {"<your-api-key>"}</code>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default DeveloperPortal;
