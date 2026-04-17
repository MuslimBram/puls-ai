import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export const ValidateWhatsAppButton = () => {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async (sendTest: boolean) => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("validate-whatsapp-connection", {
        body: sendTest ? { to } : {},
      });
      if (error) throw error;
      setResult(data);
      if (data?.ok) toast.success("WhatsApp channel validated");
      else toast.error("Validation found issues");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ label, ok }: { label: string; ok: boolean }) => (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-foreground">{label}</span>
      {ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
    </div>
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ShieldCheck className="h-4 w-4 mr-1" /> Validate WhatsApp
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validate WhatsApp Connection</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Button onClick={() => run(false)} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Run validation checks
            </Button>

            <div className="space-y-2">
              <Label>Optional: send test message to phone (E.164, e.g. +355691234567)</Label>
              <div className="flex gap-2">
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+355..." />
                <Button onClick={() => run(true)} disabled={loading || !to}>
                  Send test
                </Button>
              </div>
            </div>

            {result && (
              <div className="space-y-3 rounded-md border border-border p-3">
                {(result.results || []).map((r: any) => (
                  <div key={r.channel_id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{r.channel_name}</span>
                      <Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "Healthy" : "Issues"}</Badge>
                    </div>
                    <Row label="Channel enabled" ok={r.checks.channel_enabled} />
                    <Row label="Phone Number ID present" ok={r.checks.has_phone_number_id} />
                    <Row label="Access token present" ok={r.checks.has_access_token} />
                    <Row label="Verified with Meta API" ok={r.checks.meta_verified} />
                    {r.checks.test_send && (
                      <Row label={`Test message sent (${r.checks.test_send.message_id || r.checks.test_send.error || "no id"})`} ok={r.checks.test_send.ok} />
                    )}
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                ))}
                {!result.results && (
                  <p className="text-sm text-destructive">{result.message || "No channel configured"}</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
