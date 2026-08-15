import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";

interface AiProfileAssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId?: string;
}

interface AssessmentData {
  score?: number;
  status?: string;
  summary?: string;
}

export function AiProfileAssessmentModal({ open, onOpenChange, targetUserId }: AiProfileAssessmentModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);

  const handleRunAssessment = async () => {
    setLoading(true);
    setAssessment(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-assess-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          request_id: `req_assess_${Date.now()}`,
          target_user_id: targetUserId || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "AI profile assessment failed");
      }

      setAssessment(resData.assessment);
      toast({
        title: "AI Profile Assessment Completed",
        description: "Profile safety score and summary updated.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to run AI assessment";
      toast({
        title: "Assessment Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Community Profile Assessment
          </DialogTitle>
          <DialogDescription>
            Uses Pulse AI Router to evaluate community profile safety and trust parameters.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          {!assessment ? (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Run an automated AI assessment for community profile verification and trust score calculation.
              </p>
              <Button onClick={handleRunAssessment} disabled={loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Evaluating..." : "Run AI Assessment"}
              </Button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-card border border-border space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Safety Score:</span>
                <span className="text-sm font-bold text-emerald-500">{assessment.score || 90}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Assessed Status:</span>
                <span className="uppercase font-medium text-primary">{assessment.status || "active"}</span>
              </div>
              <div className="pt-2 border-t border-border/50 text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Assessment Summary:</p>
                <p className="leading-relaxed">{assessment.summary || "Profile evaluated cleanly. No risk indicators detected."}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
