import { useTr } from "@/lib/uiSq";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Building2, Plug, ExternalLink, Loader2, Users, ArrowRight } from "lucide-react";
import { format } from "date-fns";

const ManagedBusinesses = () => {
  const tr = useTr();
  const { user } = useAuth();

  // Businesses I referred (I can co-manage them)
  const referredQuery = useQuery({
    queryKey: ["referred-businesses", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: codes } = await supabase
        .from("business_referral_codes")
        .select("referral_code")
        .eq("user_id", user!.id);

      const myCode = codes?.[0]?.referral_code;
      if (!myCode) return [];

      const { data: refs } = await supabase
        .from("business_referrals")
        .select("id, referred_user_id, referred_email, status, created_at, converted_at, subscription_plan")
        .eq("referrer_user_id", user!.id)
        .order("created_at", { ascending: false });

      return refs ?? [];
    },
  });

  // Who referred ME (they can co-manage my account)
  const myReferrerQuery = useQuery({
    queryKey: ["my-referrer", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("business_referrals")
        .select("id, referrer_user_id, referral_code, created_at")
        .eq("referred_user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> {tr(tr("Managed Businesses"))}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr(tr("View businesses you referred (you can co-manage them) and who referred you."))}
          </p>
        </div>

        {/* My referrer */}
        <Card>
          <CardHeader>
            <CardTitle>{tr(tr("Who referred me"))}</CardTitle>
            <CardDescription>{tr(tr("The person who invited you to Pulse AI — they may co-manage your channels with your permission."))}</CardDescription>
          </CardHeader>
          <CardContent>
            {myReferrerQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : !myReferrerQuery.data ? (
              <p className="text-sm text-muted-foreground">{tr(tr("You weren't referred by anyone — you joined directly."))}</p>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {tr(tr("Referral code:"))} <span className="font-mono">{myReferrerQuery.data.referral_code}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined via this link on {format(new Date(myReferrerQuery.data.created_at), "dd MMM yyyy")}
                  </p>
                </div>
                <Badge variant="secondary">{tr(tr("Co-manager access"))}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Businesses I referred */}
        <Card>
          <CardHeader>
            <CardTitle>{tr(tr("Businesses I referred"))}</CardTitle>
            <CardDescription>
              You have full co-manager access: view their channels, edit configurations, and help with setup.
              You can never access their billing or delete data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referredQuery.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !referredQuery.data || referredQuery.data.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">{tr(tr("You haven't referred anyone yet."))}</p>
                <Button asChild size="sm">
                  <Link to="/referral-program">
                    {tr(tr("Get my referral link"))} <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("Referred")}</TableHead>
                    <TableHead>{tr("Status")}</TableHead>
                    <TableHead>{tr("Plan")}</TableHead>
                    <TableHead>{tr("Joined")}</TableHead>
                    <TableHead className="text-right">{tr(tr("Actions"))}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referredQuery.data.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.referred_email || r.referred_user_id?.slice(0, 8) || tr("Pending signup")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "converted" ? "default" : "secondary"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.subscription_plan || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={!r.referred_user_id} title={tr(tr("View channels"))}>
                            <Plug className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" disabled={!r.referred_user_id} title={tr(tr("Open business"))}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ManagedBusinesses;
