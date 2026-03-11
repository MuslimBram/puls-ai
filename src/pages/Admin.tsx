import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsAdmin, useAdminData } from "@/hooks/useAdmin";
import { Navigate } from "react-router-dom";
import { Users, Building2, Target, Radio, CreditCard, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const { profiles, businesses, leads, channels, subscriptions, isLoading } = useAdminData();

  if (roleLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{profiles.length}</p>
                <p className="text-xs text-muted-foreground">Users</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{businesses.length}</p>
                <p className="text-xs text-muted-foreground">Businesses</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{leads.length}</p>
                <p className="text-xs text-muted-foreground">Leads</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Radio className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{channels.length}</p>
                <p className="text-xs text-muted-foreground">Channels</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <CreditCard className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{subscriptions.length}</p>
                <p className="text-xs text-muted-foreground">Subscriptions</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="businesses">Businesses</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardContent className="pt-4">
                {profiles.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No users</p>
                ) : (
                  <div className="space-y-2">
                    {profiles.map((p) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{p.full_name || "No name"}</p>
                          <p className="text-xs text-muted-foreground">{p.user_id}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d, yyyy")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="businesses">
            <Card>
              <CardContent className="pt-4">
                {businesses.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No businesses</p>
                ) : (
                  <div className="space-y-2">
                    {businesses.map((b) => (
                      <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.business_name}</p>
                          <p className="text-xs text-muted-foreground">{b.industry || "—"}</p>
                        </div>
                        <Badge variant="secondary">{b.ai_tone || "professional"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads">
            <Card>
              <CardContent className="pt-4">
                {leads.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No leads</p>
                ) : (
                  <div className="space-y-2">
                    {leads.slice(0, 50).map((l) => (
                      <div key={l.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground line-clamp-1">{l.message_content}</p>
                          <p className="text-xs text-muted-foreground">{l.source_name}</p>
                        </div>
                        <Badge variant="secondary">{Math.round(Number(l.intent_score) * 100)}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels">
            <Card>
              <CardContent className="pt-4">
                {channels.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No channels</p>
                ) : (
                  <div className="space-y-2">
                    {channels.map((ch) => (
                      <div key={ch.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm font-medium text-foreground">{ch.channel_name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{ch.channel_type}</Badge>
                          <Badge variant={ch.is_enabled ? "default" : "outline"}>
                            {ch.is_enabled ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions">
            <Card>
              <CardContent className="pt-4">
                {subscriptions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No subscriptions</p>
                ) : (
                  <div className="space-y-2">
                    {subscriptions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-xs text-muted-foreground">{s.user_id}</span>
                        <div className="flex items-center gap-2">
                          <Badge>{s.plan}</Badge>
                          <span className="text-xs text-muted-foreground">{s.leads_used}/{s.leads_limit} leads</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Admin;
