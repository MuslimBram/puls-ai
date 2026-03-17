import { useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels, ChannelData } from "@/hooks/useChannels";
import { useChannelRegistry, ChannelRegistryItem } from "@/hooks/useChannelRegistry";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useIsAdmin } from "@/hooks/useAdmin";
import { ChannelCredentialSetup } from "@/components/ChannelCredentialSetup";
import { TelegramSetup } from "@/components/TelegramSetup";
import { EmailSetup } from "@/components/EmailSetup";
import { WebsiteChatSetup } from "@/components/WebsiteChatSetup";
import { WebhookSetup } from "@/components/WebhookSetup";
import { SafeRender } from "@/components/SafeRender";
import { PLAN_ORDER, PlanKey, PLANS } from "@/config/plans";
import { channelFieldGuides, getFieldGuide } from "@/config/fieldGuides";
import { FieldLabelWithGuide } from "@/components/FieldGuide";
import { Plus, Trash2, Radio, MessageSquare, Mail, Globe, Share2, Webhook, Settings2, Lock, CheckCircle2, Crown } from "lucide-react";
import { toast } from "@/components/ui/sonner";

const CATEGORY_ICONS: Record<string, any> = {
  messaging: MessageSquare,
  email: Mail,
  website: Globe,
  social: Share2,
  custom: Webhook,
};

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Messaging",
  email: "Email",
  website: "Website",
  social: "Social",
  custom: "Custom",
  voice: "Voice",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "outline"; icon: any }> = {
  live: { label: "Live", variant: "default", icon: CheckCircle2 },
  setup_ready: { label: "Setup Required", variant: "secondary", icon: Settings2 },
};

const Channels = () => {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<ChannelData>({ channel_type: "telegram", channel_name: "" });
  const [setupChannel, setSetupChannel] = useState<ChannelRegistryItem | null>(null);
  const { channels, isLoading, addChannel, toggleChannel, deleteChannel } = useChannels();
  const { registry } = useChannelRegistry();
  const { currentPlanKey } = useFeatureGating();
  const { isAdmin } = useIsAdmin();

  const canAccessChannel = (minPlan: string) => {
    if (isAdmin) return true;
    const currentIdx = PLAN_ORDER.indexOf(currentPlanKey);
    const requiredIdx = PLAN_ORDER.indexOf(minPlan as PlanKey);
    return requiredIdx === -1 || currentIdx >= requiredIdx;
  };

  const handleAdd = () => {
    if (!form.channel_name.trim()) return;
    addChannel.mutate(form, {
      onSuccess: () => {
        setShowAdd(false);
        setForm({ channel_type: "telegram", channel_name: "" });
      },
    });
  };

  const categories = registry.reduce<Record<string, ChannelRegistryItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Connected Channels */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="h-5 w-5 text-primary" />
                Connected Channels
              </CardTitle>
              <CardDescription>Manage your active communication channels.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Channel
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : channels.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No channels configured. Add a channel to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {channels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                      <Badge variant="secondary" className="text-xs">{ch.channel_type}</Badge>
                      <Badge variant="outline" className="text-xs">{ch.connection_status}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={ch.is_enabled}
                        onCheckedChange={(checked) => toggleChannel.mutate({ id: ch.id, is_enabled: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => deleteChannel.mutate(ch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel Setup Sections */}
        <SafeRender label="Telegram Setup"><TelegramSetup /></SafeRender>
        <SafeRender label="Email Setup"><EmailSetup /></SafeRender>
        <SafeRender label="Website Chat Setup"><WebsiteChatSetup /></SafeRender>
        <SafeRender label="Webhook Setup"><WebhookSetup /></SafeRender>

        {/* Channel Registry */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Channel Integrations</CardTitle>
            <CardDescription>Configure and monitor integration status for every channel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={Object.keys(categories)[0] || "messaging"}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {Object.keys(categories).map((cat) => {
                  const Icon = CATEGORY_ICONS[cat] || Radio;
                  return (
                    <TabsTrigger key={cat} value={cat} className="gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {CATEGORY_LABELS[cat] || cat}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {Object.entries(categories).map(([cat, items]) => (
                <TabsContent key={cat} value={cat}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((item) => {
                      const statusInfo = STATUS_CONFIG[item.integration_status] || STATUS_CONFIG.setup_ready;
                      const StatusIcon = statusInfo.icon;
                      const hasExistingChannel = channels.some((c) => c.channel_type === item.id);
                      const hasAccess = canAccessChannel(item.min_plan);
                      const minPlanName = PLANS[item.min_plan as PlanKey]?.name || item.min_plan;
                      const canSetup = hasAccess && item.credential_fields.length > 0;

                      return (
                        <div key={item.id} className={`rounded-lg border p-3 ${!hasAccess ? 'border-border/50 opacity-75' : 'border-border'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                            <div className="flex items-center gap-1.5">
                              {!hasAccess && (
                                <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                                  <Crown className="h-3 w-3" />
                                  {minPlanName}+
                                </Badge>
                              )}
                              {hasAccess && (
                                <Badge variant={statusInfo.variant} className="text-xs gap-1">
                                  <StatusIcon className="h-3 w-3" />
                                  {item.integration_status === 'live' ? 'Live' : 'Setup Required'}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
                          <div className="flex items-center justify-between">
                            {hasExistingChannel && (
                              <Badge variant="default" className="text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Connected
                              </Badge>
                            )}
                            {canSetup && !hasExistingChannel && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => setSetupChannel(item)}
                              >
                                <Settings2 className="h-3 w-3 mr-1" /> Configure
                              </Button>
                            )}
                            {canSetup && hasExistingChannel && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7"
                                onClick={() => setSetupChannel(item)}
                              >
                                <Settings2 className="h-3 w-3 mr-1" /> Update
                              </Button>
                            )}
                            {!hasAccess && !hasExistingChannel && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => window.location.href = '/pricing'}
                              >
                                <Lock className="h-3 w-3 mr-1" /> Upgrade to {minPlanName}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Add Channel Dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Channel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">Type</label>
                <Select value={form.channel_type} onValueChange={(v) => setForm((f) => ({ ...f, channel_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {registry
                      .filter((r) => canAccessChannel(r.min_plan))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabelWithGuide label="Channel Name" guide={getFieldGuide(channelFieldGuides, "channel_name")!} />
                <Input
                  placeholder="e.g. Main Telegram Group"
                  value={form.channel_name}
                  onChange={(e) => setForm((f) => ({ ...f, channel_name: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={addChannel.isPending}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Credential Setup Dialog */}
        {setupChannel && (
          <ChannelCredentialSetup
            open={!!setupChannel}
            channelId={setupChannel.id}
            channelName={setupChannel.name}
            setupInstructions={setupChannel.setup_instructions}
            credentialFields={setupChannel.credential_fields}
            integrationStatus={setupChannel.integration_status}
            helpUrl={setupChannel.help_url}
            onClose={() => setSetupChannel(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Channels;
