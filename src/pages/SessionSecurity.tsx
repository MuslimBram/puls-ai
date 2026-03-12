import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSessions, useRevokeSession } from "@/hooks/useUserSessions";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield,
  Smartphone,
  Monitor,
  Loader2,
  LogOut,
  Clock,
  Globe,
} from "lucide-react";
import { format } from "date-fns";

const parseDevice = (ua: string | null) => {
  if (!ua) return { type: "unknown", name: "Unknown Device" };
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const isTablet = /Tablet|iPad/i.test(ua);
  let browser = "Browser";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";

  let os = "Unknown OS";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return {
    type: isMobile ? "mobile" : isTablet ? "tablet" : "desktop",
    name: `${browser} on ${os}`,
  };
};

const SessionSecurity = () => {
  const { user } = useAuth();
  const { data: sessions, isLoading } = useUserSessions();
  const revokeMutation = useRevokeSession();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Security & Sessions</h1>

        <Tabs defaultValue="sessions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="sessions">Active Sessions ({sessions?.length || 0})</TabsTrigger>
            <TabsTrigger value="security">Security Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="sessions" className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !sessions?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No active sessions found.</CardContent></Card>
            ) : (
              sessions.map((session) => {
                const device = parseDevice(session.user_agent);
                const DeviceIcon = device.type === "mobile" ? Smartphone : Monitor;
                return (
                  <Card key={session.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <DeviceIcon className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{device.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {session.ip_address && (
                              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{session.ip_address}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last active {format(new Date(session.last_active_at), "MMM d, HH:mm")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {session.is_active ? "Active" : "Expired"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => revokeMutation.mutate(session.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Session Settings</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Inactivity Timeout</p>
                    <p className="text-xs text-muted-foreground">Auto logout after 30 minutes of inactivity</p>
                  </div>
                  <Badge>30 min</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Session Expiry</p>
                    <p className="text-xs text-muted-foreground">Sessions expire after 24 hours</p>
                  </div>
                  <Badge>24 hours</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Step-up Authentication</p>
                    <p className="text-xs text-muted-foreground">Required for billing changes, channel connections, and team management</p>
                  </div>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Account Security</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <Badge variant="outline">Verified</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">Last changed: Unknown</p>
                  </div>
                  <Button size="sm" variant="outline">Change</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SessionSecurity;
