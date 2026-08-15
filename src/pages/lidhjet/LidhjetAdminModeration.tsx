import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, CheckCircle2, XCircle, Settings, Loader2, AlertCircle } from "lucide-react";

interface ReportItem {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

interface ViolationItem {
  id: string;
  user_id: string;
  severity?: string;
  violation_type: string;
  notes?: string;
  created_at: string;
}

interface CommunitySettingItem {
  id: string;
  lek_per_eur?: number | null;
  ai_daily_limit?: number;
}

export default function LidhjetAdminModeration() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("reports");
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [violations, setViolations] = useState<ViolationItem[]>([]);
  const [, setSettings] = useState<CommunitySettingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Settings edit
  const [lekPerEurInput, setLekPerEurInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load pending reports
      const { data: repData, error: repError } = await supabase
        .from("community_reports")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (repError) console.error("Error loading reports:", repError.message);

      // 2. Load confirmed violations
      const { data: vioData, error: vioError } = await supabase
        .from("community_violations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (vioError) console.error("Error loading violations:", vioError.message);

      // 3. Load community settings
      const { data: setData, error: setError } = await supabase
        .from("community_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (setError) console.error("Error loading settings:", setError.message);

      setReports((repData as ReportItem[]) || []);
      setViolations((vioData as ViolationItem[]) || []);
      setSettings((setData as CommunitySettingItem) || null);
      if (setData?.lek_per_eur) {
        setLekPerEurInput(String(setData.lek_per_eur));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      toast({
        title: "Admin Fetch Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleReviewReport = async (reportId: string, action: "confirm" | "dismiss") => {
    setReviewingId(reportId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-moderation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          report_id: reportId,
          action,
          notes: action === "confirm" ? "Confirmed by staff review" : "Dismissed after investigation",
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "Report review failed");
      }

      toast({
        title: action === "confirm" ? "Violation Confirmed" : "Report Dismissed",
        description: action === "confirm" ? "Created 1 confirmed violation record." : "Report marked as dismissed.",
      });

      loadAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to process report";
      toast({
        title: "Review Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setReviewingId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const numLek = Number(lekPerEurInput);

    if (isNaN(numLek) || numLek <= 0) {
      toast({
        title: "Invalid Input",
        description: "lek_per_eur must be a positive number.",
        variant: "destructive",
      });
      return;
    }

    setSavingSettings(true);

    try {
      const { error } = await supabase
        .from("community_settings")
        .update({
          lek_per_eur: numLek,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      if (error) throw new Error(error.message);

      toast({
        title: "Settings Saved",
        description: `Updated FX rate to 1 EUR = ${numLek} ALL.`,
      });

      loadAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save settings";
      toast({
        title: "Save Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Lidhjet Admin & Moderation</h1>
              <Badge variant="secondary" className="gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <ShieldCheck className="h-3 w-3" />
                Staff Moderation
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review allegations, manage confirmed violations, and configure community settings.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 max-w-md">
            <TabsTrigger value="reports">Pending Reports ({reports.length})</TabsTrigger>
            <TabsTrigger value="violations">Violations ({violations.length})</TabsTrigger>
            <TabsTrigger value="settings">Settings & FX</TabsTrigger>
          </TabsList>

          {/* Pending Reports Tab */}
          <TabsContent value="reports" className="space-y-4 pt-4">
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>User reports are allegations status=pending. Confirming a report creates exactly 1 official violation record via backend RPC.</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <Card className="text-center py-10 p-4 text-xs text-muted-foreground">
                No pending community report allegations awaiting review.
              </Card>
            ) : (
              reports.map((report) => (
                <Card key={report.id} className="hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="uppercase text-[10px]">
                          Target: {report.target_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          ID: {report.target_id}
                        </span>
                      </div>

                      <span className="text-[11px] text-muted-foreground">
                        {new Date(report.created_at).toLocaleString()}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 text-xs">
                    <div className="p-3 rounded-lg bg-muted/50 border border-border/50 text-foreground">
                      <p className="font-semibold text-[11px] text-muted-foreground mb-0.5">Allegation Reason:</p>
                      <p>{report.reason}</p>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={reviewingId === report.id}
                        onClick={() => handleReviewReport(report.id, "dismiss")}
                        className="gap-1 text-xs"
                      >
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        Dismiss Report
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={reviewingId === report.id}
                        onClick={() => handleReviewReport(report.id, "confirm")}
                        className="gap-1 text-xs"
                      >
                        {reviewingId === report.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Confirm Violation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* Violations Tab */}
          <TabsContent value="violations" className="space-y-4 pt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : violations.length === 0 ? (
              <Card className="text-center py-10 p-4 text-xs text-muted-foreground">
                No confirmed community violations recorded yet.
              </Card>
            ) : (
              <div className="space-y-3">
                {violations.map((vio) => (
                  <Card key={vio.id} className="p-4 border-l-4 border-l-destructive">
                    <div className="flex items-start justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">User ID:</span>
                          <span className="font-mono text-muted-foreground">{vio.user_id}</span>
                          <Badge variant="destructive" className="uppercase text-[9px]">
                            {vio.severity || "medium"}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1">
                          Type: <strong className="text-foreground">{vio.violation_type}</strong>
                        </p>
                        {vio.notes && <p className="text-muted-foreground mt-0.5">Notes: {vio.notes}</p>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(vio.created_at).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Settings & FX Tab */}
          <TabsContent value="settings" className="space-y-4 pt-4">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-primary" />
                  Community Settings & FX Rate
                </CardTitle>
                <CardDescription>
                  Configure exchange rate (lek_per_eur) used to debit EUR wallets for ALL service taxes.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="lekPerEur">1 EUR = ? ALL (lek_per_eur)</Label>
                    <Input
                      id="lekPerEur"
                      type="number"
                      placeholder="e.g. 100"
                      value={lekPerEurInput}
                      onChange={(e) => setLekPerEurInput(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      If unconfigured (NULL), service tax payments fail closed with <code className="font-mono text-destructive">fx_not_configured</code>.
                    </p>
                  </div>

                  <Button type="submit" disabled={savingSettings} className="gap-2 w-full">
                    {savingSettings && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Community FX Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
