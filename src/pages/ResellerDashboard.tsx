import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePartnerAccount } from "@/hooks/usePartner";
import { useResellerClients, useResellerAnalytics, useProvisionClient, useUpdateClientPlan } from "@/hooks/useReseller";
import { PartnerBulkBilling } from "@/components/PartnerBulkBilling";
import { Building2, Plus, Users, DollarSign, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";

const ResellerDashboard = () => {
  const { data: partner, isLoading: partnerLoading } = usePartnerAccount();
  const { data: clients } = useResellerClients(partner?.id ?? null);
  const { data: analytics } = useResellerAnalytics(partner?.id ?? null);
  const provisionClient = useProvisionClient();
  const updatePlan = useUpdateClientPlan();

  const [newName, setNewName] = useState("");
  const [newPlan, setNewPlan] = useState("starter");
  const [dialogOpen, setDialogOpen] = useState(false);

  if (partnerLoading) return <DashboardLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div></DashboardLayout>;
  if (!partner) return <DashboardLayout><Card><CardContent className="py-12 text-center text-muted-foreground">You need an active partner account to access reseller features.</CardContent></Card></DashboardLayout>;

  const handleProvision = async () => {
    if (!newName.trim()) return;
    await provisionClient.mutateAsync({ partnerId: partner.id, businessName: newName, plan: newPlan });
    setNewName("");
    setDialogOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reseller Dashboard</h1>
            <p className="text-sm text-muted-foreground">Manage client workspaces and billing under your brand</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Provision Client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Client Workspace</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <Input placeholder="Business name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Select value={newPlan} onValueChange={setNewPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="starter">Starter</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleProvision} disabled={provisionClient.isPending} className="w-full">
                  {provisionClient.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Workspace
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Analytics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{analytics?.totalClients ?? 0}</p><p className="text-xs text-muted-foreground">Total Clients</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Building2 className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{analytics?.activeClients ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="h-8 w-8 text-accent" /><div><p className="text-2xl font-bold">${analytics?.totalRevenue?.toFixed(0) ?? 0}</p><p className="text-xs text-muted-foreground">Monthly Revenue</p></div></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold">{analytics?.churnedClients ?? 0}</p><p className="text-xs text-muted-foreground">Churned</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="clients">
          <TabsList>
            <TabsTrigger value="clients">Client Workspaces</TabsTrigger>
            <TabsTrigger value="billing">Bulk Billing</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="clients" className="space-y-3">
            {(clients || []).length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">No client workspaces yet. Provision your first client above.</CardContent></Card>
            ) : (
              (clients || []).map((client) => (
                <Card key={client.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{client.workspaces?.name || "Workspace"}</p>
                        <p className="text-xs text-muted-foreground">Provisioned {new Date(client.provisioned_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={client.is_active ? "default" : "secondary"}>{client.is_active ? "Active" : "Inactive"}</Badge>
                      <Select
                        value={client.assigned_plan}
                        onValueChange={(plan) => updatePlan.mutate({ clientId: client.id, plan })}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="growth">Growth</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="billing">
            <PartnerBulkBilling partnerId={partner.id} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Plan Distribution</CardTitle></CardHeader>
              <CardContent>
                {analytics?.planDistribution && Object.entries(analytics.planDistribution).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(analytics.planDistribution).map(([plan, count]) => (
                      <div key={plan} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{plan}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(20, (count / (analytics.totalClients || 1)) * 200)}px` }} />
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ResellerDashboard;
