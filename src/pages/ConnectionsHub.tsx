import { useState, lazy, Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels } from "@/hooks/useChannels";
import { useChannelRegistry } from "@/hooks/useChannelRegistry";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useExternalIntegrations } from "@/hooks/useExternalIntegrations";
import { useAuth } from "@/contexts/AuthContext";
import { ChannelConnectionWizard, CHANNEL_PROVIDERS } from "@/components/ChannelConnectionWizard";
import { ChannelCredentialSetup } from "@/components/ChannelCredentialSetup";
import type { ChannelRegistryItem } from "@/hooks/useChannelRegistry";
import type { ProviderDef } from "@/components/ChannelConnectionWizard";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Key,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  Plug,
  Radio,
  Settings2,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { format } from "date-fns";

const ConnectionsHub = () => {
  const { user } = useAuth();
  const { channels, isLoading, toggleChannel, deleteChannel } = useChannels();
  const { registry } = useChannelRegistry();
  const { integrations } = useExternalIntegrations();
  const { permissions, isAdmin, isSuperAdmin } = useRolePermissions();
  const [wizardProvider, setWizardProvider] = useState<ProviderDef | null>(null);
  const [setupChannel, setSetupChannel] = useState<ChannelRegistryItem | null>(null);

  const isAdminOnly = (isAdmin || isSuperAdmin) && !permissions.canConnectChannels;

  const IconMap: Record<string, any> = {
    whatsapp: Phone,
    telegram: MessageSquare,
    email: Mail,
    facebook: Globe,
    instagram: Globe,
    sms: Phone,
    webchat: Globe,
    voip: Phone,
  };

  const connectedCount = channels.filter((c) => c.is_enabled).length;
  const errorCount = channels.filter((c) => c.connection_status === "error").length;
  const integrationCount = integrations.filter((i) => i.is_enabled).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{connectedCount}</p>
                <p className="text-xs text-muted-foreground">Active Channels</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{errorCount}</p>
                <p className="text-xs text-muted-foreground">Connection Errors</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20">
                <Plug className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{integrationCount}</p>
                <p className="text-xs text-muted-foreground">Active Integrations</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                <Activity className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{channels.length}</p>
                <p className="text-xs text-muted-foreground">Total Channels</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isAdminOnly && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 p-4">
              <Shield className="h-5 w-5 text-primary" />
              <p className="text-sm text-foreground">
                <strong>Admin view:</strong> You can monitor and disable connections but cannot connect channels on behalf of businesses.
              </p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="channels" className="space-y-4">
          <TabsList>
            <TabsTrigger value="channels">Messaging Channels</TabsTrigger>
            <TabsTrigger value="telephony">Telephony</TabsTrigger>
            <TabsTrigger value="integrations">Integrations & API</TabsTrigger>
            <TabsTrigger value="health">Connection Health</TabsTrigger>
          </TabsList>

          {/* MESSAGING CHANNELS */}
          <TabsContent value="channels" className="space-y-4">
            {permissions.canConnectChannels && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Plug className="h-5 w-5 text-primary" />
                    Connect a Channel
                  </CardTitle>
                  <CardDescription>
                    Set up your messaging channels. Each connection is scoped to your business workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {CHANNEL_PROVIDERS.map((prov) => {
                      const isConnected = channels.some((c) => c.channel_type === prov.id);
                      const Icon = IconMap[prov.id] || Radio;
                      return (
                        <div key={prov.id} className="rounded-lg border border-border p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <span className="text-sm font-medium text-foreground">{prov.name}</span>
                            {isConnected && (
                              <Badge variant="default" className="ml-auto gap-1 text-xs">
                                <CheckCircle2 className="h-3 w-3" /> Live
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{prov.description}</p>
                          <Button
                            size="sm"
                            variant={isConnected ? "ghost" : "outline"}
                            className="text-xs w-full"
                            onClick={() => setWizardProvider(prov)}
                          >
                            <Settings2 className="h-3 w-3 mr-1" />
                            {isConnected ? "Update" : "Connect"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Channels List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Channels</CardTitle>
                <CardDescription>All connected messaging channels for this workspace.</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No channels connected yet. Connect your first channel above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const Icon = IconMap[ch.channel_type] || Radio;
                      return (
                        <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="flex items-center gap-3">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                            <Badge variant="secondary" className="text-xs">{ch.channel_type}</Badge>
                            <Badge
                              variant={ch.connection_status === "connected" ? "default" : ch.connection_status === "error" ? "destructive" : "outline"}
                              className="text-xs"
                            >
                              {ch.connection_status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={ch.is_enabled}
                              onCheckedChange={(checked) => toggleChannel.mutate({ id: ch.id, is_enabled: checked })}
                            />
                            {permissions.canConnectChannels && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => deleteChannel.mutate(ch.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TELEPHONY */}
          <TabsContent value="telephony" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Phone className="h-5 w-5 text-primary" />
                  Telephony Provider
                </CardTitle>
                <CardDescription>
                  Connect your VoIP/SIP provider for inbound and outbound calling.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {permissions.canConnectChannels ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <Phone className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">Twilio / SIP</p>
                          <p className="text-xs text-muted-foreground">Configure your telephony credentials for call center functionality.</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => window.location.href = "/telephony"}>
                        <Settings2 className="h-3 w-3 mr-1" /> Configure Telephony
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">
                    {isAdminOnly
                      ? "Admin cannot connect telephony on behalf of businesses. Business owners manage their own telephony."
                      : "You don't have permission to configure telephony."}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* INTEGRATIONS & API */}
          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Key className="h-5 w-5 text-primary" />
                  API Tokens & Integrations
                </CardTitle>
                <CardDescription>Manage API keys, webhooks, and third-party integrations.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">Public API</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Manage API keys for programmatic access.</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => window.location.href = "/public-api"}>
                      Manage API Keys
                    </Button>
                  </div>
                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Plug className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">External Integrations</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Connect CRM, analytics, and other tools.</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => window.location.href = "/connected-accounts?tab=integrations"}>
                      Manage Integrations
                    </Button>
                  </div>
                </div>

                {integrations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium text-foreground">Active Integrations</p>
                    {integrations.filter(i => i.is_enabled).map((integ) => (
                      <div key={integ.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{integ.category}</Badge>
                          <span className="text-sm text-foreground">{integ.integration_name}</span>
                        </div>
                        <Badge variant={integ.status === "active" ? "default" : "outline"} className="text-xs">
                          {integ.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONNECTION HEALTH */}
          <TabsContent value="health" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5 text-primary" />
                  Connection Health Monitor
                </CardTitle>
                <CardDescription>Real-time status of all connections.</CardDescription>
              </CardHeader>
              <CardContent>
                {channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No connections to monitor.</p>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const Icon = IconMap[ch.channel_type] || Radio;
                      const isHealthy = ch.connection_status === "connected" && ch.is_enabled;
                      const isError = ch.connection_status === "error";
                      return (
                        <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div className="flex items-center gap-3">
                            {isHealthy ? (
                              <Wifi className="h-4 w-4 text-primary" />
                            ) : isError ? (
                              <WifiOff className="h-4 w-4 text-destructive" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={isHealthy ? "default" : isError ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {isHealthy ? "Healthy" : isError ? "Error" : "Inactive"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(ch.updated_at || ch.created_at), "MMM d, HH:mm")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Wizards */}
      {wizardProvider && (
        <ChannelConnectionWizard
          provider={wizardProvider}
          open={!!wizardProvider}
          onClose={() => setWizardProvider(null)}
        />
      )}
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
    </DashboardLayout>
  );
};

export default ConnectionsHub;
