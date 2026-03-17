import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsAdmin, useAdminData, useAdminActions } from "@/hooks/useAdmin";
import { useAdminPartners } from "@/hooks/useAdminPartners";
import { usePricingSettings, type PricingSetting } from "@/hooks/usePricingSettings";
import { Navigate } from "react-router-dom";
import { Users, Building2, Target, Radio, CreditCard, ShieldCheck, Ban, RotateCcw, Crown, FileText, Handshake, CheckCircle, XCircle, DollarSign, Save, Activity, Rocket, Shield, Briefcase, Wallet, AlertTriangle, Server, ListChecks, Skull } from "lucide-react";
import { format } from "date-fns";
import { AdminSystemHealth } from "@/components/AdminSystemHealth";
import { AdminLaunchControls } from "@/components/AdminLaunchControls";
import { AdminCommissionManager } from "@/components/AdminCommissionManager";
import { AdminRefundPanel } from "@/components/AdminRefundPanel";
import { BusinessReviewQueue } from "@/components/BusinessReviewQueue";
import { AdminFreelancerPanel } from "@/components/AdminFreelancerPanel";
import { AdminPaymentOverview } from "@/components/AdminPaymentOverview";
import { AdminChurnRiskPanel } from "@/components/AdminChurnRiskPanel";
import { AdminApiErrorLog } from "@/components/AdminApiErrorLog";
import { AdminDeadLetterPanel } from "@/components/AdminDeadLetterPanel";
import { AdminJobQueuePanel } from "@/components/AdminJobQueuePanel";

const Admin = () => {
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const { profiles, businesses, leads, channels, subscriptions, auditLogs, isLoading } = useAdminData();
  const { suspendUser, resetUsage, updatePlan } = useAdminActions();
  const { partners, approvePartner, rejectPartner } = useAdminPartners();
  const { settings: pricingSettings, updatePrice } = usePricingSettings();
  const [editPrices, setEditPrices] = useState<Record<string, { monthly: string; annual: string; label: string }>>({});

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

  const getSubForUser = (userId: string) => subscriptions.find((s) => s.user_id === userId);

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
              <Handshake className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{partners.filter(p => p.status === "pending").length}</p>
                <p className="text-xs text-muted-foreground">Pending Partners</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="partners">
              Partners
              {partners.filter(p => p.status === "pending").length > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">
                  {partners.filter(p => p.status === "pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="businesses">Businesses</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="pricing">
              <DollarSign className="h-3 w-3 mr-1" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            <TabsTrigger value="commissions">
              <DollarSign className="h-3 w-3 mr-1" />
              Commissions
            </TabsTrigger>
            <TabsTrigger value="health">
              <Activity className="h-3 w-3 mr-1" />
              Health
            </TabsTrigger>
            <TabsTrigger value="refunds">
              <Shield className="h-3 w-3 mr-1" />
              Refunds
            </TabsTrigger>
            <TabsTrigger value="launch">
              <Rocket className="h-3 w-3 mr-1" />
              Launch
            </TabsTrigger>
            <TabsTrigger value="registrations">
              <Building2 className="h-3 w-3 mr-1" />
              Registrations
            </TabsTrigger>
            <TabsTrigger value="freelancers">
              <Briefcase className="h-3 w-3 mr-1" />
              Freelancers
            </TabsTrigger>
            <TabsTrigger value="payments">
              <Wallet className="h-3 w-3 mr-1" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="churn">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Churn Risk
            </TabsTrigger>
            <TabsTrigger value="errors">
              <Server className="h-3 w-3 mr-1" />
              API Errors
            </TabsTrigger>
            <TabsTrigger value="dlq">
              <Skull className="h-3 w-3 mr-1" />
              Dead Letters
            </TabsTrigger>
            <TabsTrigger value="jobs">
              <ListChecks className="h-3 w-3 mr-1" />
              Job Queue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card>
              <CardContent className="pt-4">
                {profiles.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No users</p>
                ) : (
                  <div className="space-y-2">
                    {profiles.map((p) => {
                      const sub = getSubForUser(p.user_id);
                      const isSuspended = (p as any).is_suspended;
                      return (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{p.full_name || "No name"}</p>
                              {isSuspended && <Badge variant="destructive" className="text-xs">Suspended</Badge>}
                              {sub && <Badge variant="secondary" className="text-xs">{sub.plan}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{p.user_id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{format(new Date(p.created_at), "MMM d, yyyy")}</span>
                            <Button
                              variant={isSuspended ? "outline" : "destructive"}
                              size="sm"
                              onClick={() => suspendUser.mutate({ userId: p.user_id, suspend: !isSuspended })}
                            >
                              <Ban className="h-3 w-3 mr-1" />
                              {isSuspended ? "Reactivate" : "Suspend"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetUsage.mutate(p.user_id)}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" /> Reset Usage
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Partners Tab */}
          <TabsContent value="partners">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Handshake className="h-4 w-4" />
                  Partner Applications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {partners.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No partner applications</p>
                ) : (
                  <div className="space-y-2">
                    {partners.map((partner) => (
                      <div key={partner.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{partner.partner_name}</p>
                            <Badge
                              variant={partner.status === "active" ? "default" : partner.status === "pending" ? "secondary" : "destructive"}
                              className="text-xs"
                            >
                              {partner.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Applied {format(new Date(partner.created_at), "MMM d, yyyy")} · Discount: {partner.discount_percent}% · Model: {partner.billing_model}
                          </p>
                          <p className="text-xs text-muted-foreground">User: {partner.user_id.substring(0, 8)}...</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {partner.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => approvePartner.mutate(partner.id)}
                                disabled={approvePartner.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => rejectPartner.mutate(partner.id)}
                                disabled={rejectPartner.isPending}
                              >
                                <XCircle className="h-3 w-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {partner.status === "active" && (
                            <span className="text-xs text-muted-foreground">
                              {partner.total_businesses || 0} businesses · ${partner.monthly_revenue || 0}/mo
                            </span>
                          )}
                        </div>
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
                        <div>
                          <span className="text-xs text-muted-foreground block">{s.user_id}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge>{s.plan}</Badge>
                            <Badge variant="outline">{s.subscription_status}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {s.leads_used}/{s.leads_limit} leads · {s.ai_replies_today} AI today
                            </span>
                          </div>
                          {s.trial_end && (
                            <span className="text-xs text-muted-foreground">Trial ends: {format(new Date(s.trial_end), "MMM d")}</span>
                          )}
                          {s.grace_period_end && (
                            <span className="text-xs text-destructive ml-2">Grace: {format(new Date(s.grace_period_end), "MMM d")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={s.plan}
                            onValueChange={(plan) => updatePlan.mutate({ userId: s.user_id, plan })}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">Standard</SelectItem>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="advanced">Advanced</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resetUsage.mutate(s.user_id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Management Tab */}
          <TabsContent value="pricing">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pricing Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pricingSettings.map((setting) => {
                    const edit = editPrices[setting.id] || {
                      monthly: String(setting.monthly_price),
                      annual: String(setting.annual_price),
                      label: setting.donation_label || "",
                    };
                    const hasChanges =
                      edit.monthly !== String(setting.monthly_price) ||
                      edit.annual !== String(setting.annual_price) ||
                      edit.label !== (setting.donation_label || "");

                    return (
                      <div key={setting.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <div className="min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground capitalize">
                              {setting.plan_key.replace("_", " ")}
                            </p>
                            {setting.is_donation && (
                              <Badge variant="secondary" className="text-xs">Donation</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Monthly $</span>
                            <Input
                              type="number"
                              className="w-20 h-8 text-xs"
                              value={edit.monthly}
                              onChange={(e) =>
                                setEditPrices((prev) => ({
                                  ...prev,
                                  [setting.id]: { ...edit, monthly: e.target.value },
                                }))
                              }
                            />
                          </div>
                          {!setting.is_donation && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Annual $</span>
                              <Input
                                type="number"
                                className="w-24 h-8 text-xs"
                                value={edit.annual}
                                onChange={(e) =>
                                  setEditPrices((prev) => ({
                                    ...prev,
                                    [setting.id]: { ...edit, annual: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          )}
                          {setting.is_donation && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Label</span>
                              <Input
                                className="w-40 h-8 text-xs"
                                value={edit.label}
                                onChange={(e) =>
                                  setEditPrices((prev) => ({
                                    ...prev,
                                    [setting.id]: { ...edit, label: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!hasChanges || updatePrice.isPending}
                          onClick={() =>
                            updatePrice.mutate({
                              id: setting.id,
                              monthly_price: Number(edit.monthly),
                              annual_price: Number(edit.annual),
                              donation_label: edit.label || undefined,
                            })
                          }
                        >
                          <Save className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardContent className="pt-4">
                {auditLogs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No audit logs</p>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log: any) => (
                      <div key={log.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{log.action}</span>
                            {log.target_type && (
                              <Badge variant="secondary" className="text-xs">{log.target_type}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Actor: {log.actor_id?.substring(0, 8)}… 
                            {log.target_id && <> · Target: {log.target_id.substring(0, 8)}…</>}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <> · {JSON.stringify(log.metadata)}</>
                            )}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{format(new Date(log.created_at), "MMM d, HH:mm")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commissions">
            <AdminCommissionManager />
          </TabsContent>

          <TabsContent value="health">
            <AdminSystemHealth />
          </TabsContent>

          <TabsContent value="refunds">
            <AdminRefundPanel />
          </TabsContent>

          <TabsContent value="launch">
            <AdminLaunchControls />
          </TabsContent>

          <TabsContent value="registrations">
            <BusinessReviewQueue />
          </TabsContent>

          <TabsContent value="freelancers">
            <AdminFreelancerPanel />
          </TabsContent>

          <TabsContent value="payments">
            <AdminPaymentOverview />
          </TabsContent>

          <TabsContent value="churn">
            <AdminChurnRiskPanel />
          </TabsContent>

          <TabsContent value="errors">
            <AdminApiErrorLog />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Admin;