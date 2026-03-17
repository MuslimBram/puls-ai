import { useQuery } from "@tanstack/react-query";
import { Navigate, Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAdmin";
import { AdminBusinessScanInsightsView } from "@/components/AdminBusinessScanInsightsView";

const AdminBusinessScanInsights = () => {
  const { businessId } = useParams<{ businessId: string }>();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();

  const businessQuery = useQuery({
    queryKey: ["admin-business-scan-insights", businessId],
    enabled: !!businessId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_profiles")
        .select("id, business_name, industry, ai_tone, workspace_id, short_description")
        .eq("id", businessId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  if (roleLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Business Scan Insights</h1>
            </div>
            <p className="text-sm text-muted-foreground">Dedicated admin view for scan history, extracted intelligence, and AI-generated content.</p>
          </div>

          <Button asChild variant="outline">
            <Link to="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
        </div>

        {businessQuery.isLoading ? (
          <Card>
            <CardContent className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : !businessQuery.data ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Business not found.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <span>{businessQuery.data.business_name}</span>
                  {businessQuery.data.industry && <Badge variant="secondary">{businessQuery.data.industry}</Badge>}
                  {businessQuery.data.ai_tone && <Badge variant="outline">{businessQuery.data.ai_tone}</Badge>}
                </CardTitle>
              </CardHeader>
              {businessQuery.data.short_description && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {businessQuery.data.short_description}
                </CardContent>
              )}
            </Card>

            <AdminBusinessScanInsightsView business={businessQuery.data} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AdminBusinessScanInsights;
