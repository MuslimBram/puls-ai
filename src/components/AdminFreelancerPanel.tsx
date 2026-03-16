import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminFreelancers } from "@/hooks/useAdminFreelancers";
import { Users, Building2, DollarSign, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

export const AdminFreelancerPanel = () => {
  const { freelancers, isLoading } = useAdminFreelancers();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{freelancers.length}</p>
              <p className="text-xs text-muted-foreground">Active Freelancers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-foreground">
                {freelancers.reduce((s, f) => s + f.total_businesses, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Businesses</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <DollarSign className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-foreground">
                ${freelancers.reduce((s, f) => s + f.monthly_revenue, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Monthly Revenue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Freelancer List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Freelancer / Partner Directory</CardTitle>
        </CardHeader>
        <CardContent>
          {freelancers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active freelancers</p>
          ) : (
            <div className="space-y-3">
              {freelancers.map((f) => (
                <div key={f.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{f.partner_name}</p>
                      <Badge variant="outline" className="text-xs">{f.commission_rate}% commission</Badge>
                      {f.stripe_connect_id && (
                        <Badge className="bg-green-500/10 text-green-700 text-xs">Stripe Connected</Badge>
                      )}
                      {f.risk_flags_count > 0 && (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {f.risk_flags_count} flags
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Since {format(new Date(f.created_at), "MMM d, yyyy")}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{f.total_businesses} businesses</span>
                    <span>${f.monthly_revenue}/mo revenue</span>
                    <span>Code: {f.referral_code || "—"}</span>
                  </div>

                  {/* Client list */}
                  {f.clients.length > 0 && (
                    <div className="mt-2 pl-4 border-l-2 border-border space-y-1">
                      {f.clients.map((c) => (
                        <div key={c.workspace_id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-foreground">{c.workspace_name}</span>
                            <Badge variant="outline" className="text-[10px] h-4">
                              {c.relationship_status}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">${Number(c.total_revenue_generated).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
