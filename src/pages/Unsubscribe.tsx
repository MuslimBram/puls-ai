import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
        const anon = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const r = await fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`, {
          headers: { apikey: anon },
        });
        const j = await r.json().catch(() => ({}));
        if (j?.email) setEmail(j.email);
        if (j?.already_unsubscribed) setState("already");
        else if (j?.valid) setState("valid");
        else setState("invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    setSubmitting(false);
    if (error || !data?.ok) setState("error");
    else setState("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>{email ?? "Manage your subscription"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validating link…</div>}
          {state === "valid" && (
            <>
              <p className="text-sm">Are you sure you want to unsubscribe from these emails?</p>
              <Button aria-label="Loading" onClick={confirm} disabled={submitting} variant="destructive" className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm unsubscribe"}
              </Button>
            </>
          )}
          {state === "already" && <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4" /> You're already unsubscribed.</div>}
          {state === "done" && <div className="flex items-center gap-2 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> You've been unsubscribed.</div>}
          {state === "invalid" && <div className="flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4" /> Invalid or expired link.</div>}
          {state === "error" && <div className="flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4" /> Something went wrong. Try again later.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
