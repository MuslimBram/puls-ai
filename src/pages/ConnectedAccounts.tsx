import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChannels } from "@/hooks/useChannels";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, Link2, Link2Off, Mail, MessageSquare, Globe, Radio, Loader2 } from "lucide-react";
import { format } from "date-fns";

const ExternalIntegrationsContent = lazy(() => import("@/pages/ExternalIntegrations"));

const CHANNEL_ICONS: Record<string, any> = {
  telegram: MessageSquare,
  email: Mail,
  website_chat: Globe,
  custom_webhook: Radio,
};

const ConnectedAccounts = () => {
  const { user } = useAuth();
  const { channels } = useChannels();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "accounts";

  const loginProviders = [
    {
      id: "email",
      name: "Email / Password",
      connected: true,
      identifier: user?.email || "",
      icon: Mail,
    },
  ];

  return (
    <DashboardLayout>
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">Connected Accounts</TabsTrigger>
          <TabsTrigger value="integrations">External Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <div className="space-y-6">
            {/* Login Providers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-primary" />
                  Login Providers
                </CardTitle>
                <CardDescription>
                  Manage how you sign in to your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loginProviders.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <provider.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">{provider.identifier}</p>
                      </div>
                    </div>
                    <Badge variant={provider.connected ? "default" : "secondary"}>
                      {provider.connected ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Connected Channels */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5 text-primary" />
                  Connected Channels
                </CardTitle>
                <CardDescription>
                  Each channel is authorized independently. Logging in does not auto-connect channels.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {channels.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Link2Off className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No channels connected yet.</p>
                    <Button variant="outline" size="sm" className="mt-3" asChild>
                      <a href="/channels">Connect a Channel</a>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => {
                      const Icon = CHANNEL_ICONS[ch.channel_type] || Radio;
                      return (
                        <div
                          key={ch.id}
                          className="flex items-center justify-between rounded-lg border border-border p-4"
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{ch.channel_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {ch.channel_type} · Added {format(new Date(ch.created_at), "MMM d, yyyy")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                ch.connection_status === "connected"
                                  ? "default"
                                  : ch.connection_status === "needs_config"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {ch.connection_status === "connected"
                                ? "Connected"
                                : ch.connection_status === "needs_config"
                                ? "Needs Config"
                                : "Disconnected"}
                            </Badge>
                            <Badge variant={ch.is_enabled ? "default" : "secondary"}>
                              {ch.is_enabled ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Session Info</CardTitle>
                <CardDescription>Current login session details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email</span>
                  <span className="text-foreground">{user?.email}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last sign-in</span>
                  <span className="text-foreground">
                    {user?.last_sign_in_at
                      ? format(new Date(user.last_sign_in_at), "PPpp")
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Account created</span>
                  <span className="text-foreground">
                    {user?.created_at
                      ? format(new Date(user.created_at), "PPp")
                      : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <ExternalIntegrationsContent />
          </Suspense>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default ConnectedAccounts;
