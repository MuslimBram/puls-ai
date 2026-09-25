import { useState } from "react";
import { WebhookActivityLogs } from "@/components/webhooks/WebhookActivityLogs";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels } from "@/hooks/useChannels";
import { useChannelRegistryWithModes, useConnectedChannels, type ChannelRegistryWithModes, type ConnectedChannel } from "@/hooks/useChannelCapabilities";
import { useFeatureGating } from "@/hooks/useFeatureGating";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useMonetizationCatalog } from "@/hooks/useMonetizationCatalog";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";
import { useBusinessProfile } from "@/hooks/useBusinessProfile"; // R111-C1: Authorized businesses
import { ChannelConnectionModal } from "@/components/channels/ChannelConnectionModal";
import { ConnectedChannelCard } from "@/components/channels/ConnectedChannelCard";
import { ChannelCatalogCard } from "@/components/channels/ChannelCatalogCard";
import { ChannelOrbitSelector } from "@/components/channels/ChannelOrbitSelector";
import { ValidateWhatsAppButton } from "@/components/channels/ValidateWhatsAppButton";
import type { PlanKey } from "@/types/monetization";
import {
  Globe, Mail, MessageSquare, Plug, Radio, Webhook, Shield,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  messaging: "Messaging", email: "Email", web: "Web", automation: "Automation",
};
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  messaging: MessageSquare, email: Mail, web: Globe, automation: Webhook,
};

const Channels = () => {
  const [connectModal, setConnectModal] = useState<{
    channel: ChannelRegistryWithModes | null;
    existingId?: string;
    existingMode?: "professional" | "personal";
  }>({ channel: null });

  const { toggleChannel, deleteChannel } = useChannels();
  const { data: connectedChannels, isLoading } = useConnectedChannels();
  const { data: registry } = useChannelRegistryWithModes();
  const { effectivePlanKey, checkLimit } = useFeatureGating();
  const { plansByKey, planOrder } = useMonetizationCatalog();
  const { isSuperAdmin } = useRolePermissions();
  const { profiles: authorizedBusinesses } = useBusinessProfile(); // R111-C1: Get authorized businesses
  const { canWrite: workspaceCanWrite } = useWorkspaceMembership();

  const channels = connectedChannels ?? [];
  const registryItems = registry ?? [];
  const channelLimit = checkLimit("channels", channels.length);
  const channelLimitReached = channelLimit.limit !== -1 && channelLimit.current >= channelLimit.limit;

  const canAccessChannel = (minPlan: string) => {
    if (!workspaceCanWrite) return false;
    if (isSuperAdmin) return true;
    const currentIdx = planOrder.indexOf(effectivePlanKey as PlanKey);
    const requiredIdx = planOrder.indexOf(minPlan as PlanKey);
    if (currentIdx === -1 || requiredIdx === -1) return false;
    return currentIdx >= requiredIdx;
  };

  const getRegistryItem = (channelType: string) => registryItems.find((r) => r.id === channelType);

  const categories = registryItems.reduce<Record<string, ChannelRegistryWithModes[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "channels";

  const handleUpgrade = (ch: ConnectedChannel) => {
    const reg = getRegistryItem(ch.channel_type);
    if (reg) setConnectModal({ channel: reg, existingId: ch.id, existingMode: ch.connection_mode });
  };

  return (
    <DashboardLayout>
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="webhook-logs">Webhook Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="channels">
          <div className="space-y-4">
            {!workspaceCanWrite && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-center gap-3 py-4">
                  <Shield className="h-5 w-5 text-primary" />
                  <p className="text-sm text-foreground">This workspace is read-only for your current account. Connect and channel changes require workspace membership.</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plug className="h-5 w-5 text-primary" />
                  Explore Communication Channels
                </CardTitle>
                <CardDescription>
                  {workspaceCanWrite
                    ? "Browse the channel registry. Moving focus never creates a connection; choose a channel to open its existing connection flow."
                    : "Read-only workspace view. Connect, modify, or disconnect actions require workspace membership."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChannelOrbitSelector
                  items={registryItems}
                  connectedChannels={channels}
                  canAccess={canAccessChannel}
                  onChoose={(item, existing) => {
                    if (!workspaceCanWrite) return;
                    setConnectModal({
                      channel: item,
                      existingId: existing?.id,
                      existingMode: existing?.connection_mode,
                    });
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Radio className="h-5 w-5 text-primary" />
                      Connected Channels
                    </CardTitle>
                    <CardDescription>Manage your active communication channels and their connection modes.</CardDescription>
                  </div>
                  {channels.some((c) => c.channel_type === "whatsapp") && <ValidateWhatsAppButton />}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No channels connected. Use the catalog below to connect your first channel.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => (
                      <ConnectedChannelCard
                        key={ch.id}
                        channel={ch}
                        registry={getRegistryItem(ch.channel_type)}
                        onToggle={(id, enabled) => { if (workspaceCanWrite) toggleChannel.mutate({ id, is_enabled: enabled }); }}
                        onDelete={(id) => { if (workspaceCanWrite) deleteChannel.mutate(id); }}
                        onUpgrade={handleUpgrade}
                        onReconnect={handleUpgrade}
                        readOnly={!workspaceCanWrite}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {workspaceCanWrite && <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plug className="h-5 w-5 text-primary" />
                  Connect a Channel
                </CardTitle>
                <CardDescription>
                  Choose a channel and connection mode. Professional mode enables full automation; Limited mode uses notification-based manual posting.
                </CardDescription>
                <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">Channel quota:</span>{" "}
                  {channelLimit.limit === -1
                    ? `${channelLimit.current} channels · Unlimited`
                    : `${channelLimit.current} / ${channelLimit.limit} channels used`}
                </div>
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
                      {/* R111-C1: Carousel - exactly 4 cards visible, horizontal scroll for rest */}
                      <div className="relative">
                        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide">
                          <div className="flex gap-4 pb-2" style={{ width: `${(items.length * 280) + (items.length - 1) * 16}px` }}>
                            {items.map((item) => {
                              const existing = channels.find((c) => c.channel_type === item.id);
                              const hasAccess = canAccessChannel(item.min_plan);
                              const minPlanName = plansByKey[item.min_plan as PlanKey]?.name || item.min_plan;

                              return (
                                <div key={item.id} className="flex-shrink-0" style={{ width: '264px' }}>
                                  <ChannelCatalogCard
                                    item={item}
                                    existing={existing}
                                    hasAccess={hasAccess}
                                    minPlanName={minPlanName}
                                    canCreate={!channelLimitReached}
                                    onConnect={() => setConnectModal({ channel: item })}
                                    onManage={() => setConnectModal({ channel: item, existingId: existing?.id, existingMode: existing?.connection_mode })}
                                    onUpgrade={() => window.location.href = '/pricing'}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>}
          </div>
        </TabsContent>

        <TabsContent value="webhook-logs">
          <WebhookActivityLogs />
        </TabsContent>
      </Tabs>

      <ChannelConnectionModal
        open={!!connectModal.channel}
        onOpenChange={(open) => !open && setConnectModal({ channel: null })}
        channel={connectModal.channel}
        existingChannelId={connectModal.existingId}
        existingMode={connectModal.existingMode}
        authorizedBusinesses={authorizedBusinesses} // R111-C1: Pass authorized businesses
      />
    </DashboardLayout>
  );
};

export default Channels;
