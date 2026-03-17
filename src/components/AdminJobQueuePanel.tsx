import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ListChecks, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3 text-yellow-600" />,
  processing: <Loader2 className="h-3 w-3 animate-spin text-blue-600" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-600" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
};

export const AdminJobQueuePanel = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-job-queue-stats"],
    queryFn: async () => {
      const [pending, processing, failed, recent] = await Promise.all([
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("job_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("job_queue").select("*").order("created_at", { ascending: false }).limit(15),
      ]);
      return {
        pending: pending.count ?? 0,
        processing: processing.count ?? 0,
        failed: failed.count ?? 0,
        recent: recent.data ?? [],
      };
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const s = stats!;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ListChecks className="h-5 w-5 text-primary" />
          Job Queue Monitor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">{s.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{s.processing}</p>
            <p className="text-xs text-muted-foreground">Processing</p>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{s.failed}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Recent Jobs</p>
          {s.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No jobs yet</p>
          ) : (
            s.recent.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {STATUS_ICON[job.status] || null}
                  <span className="font-medium text-foreground">{job.job_type}</span>
                  <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(job.created_at), "MMM d, HH:mm")}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
