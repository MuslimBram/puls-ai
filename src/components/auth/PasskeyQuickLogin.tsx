import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

export const PasskeyQuickLogin = () => {
  const [busy, setBusy] = useState(false);

  if (typeof window === "undefined" || window.location.pathname !== "/login") return null;

  const signIn = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-primary/20 bg-card/95 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Device-bound sign-in</p>
      </div>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        Use a passkey protected by Face ID, Touch ID, Windows Hello, your device PIN, or a security key.
      </p>
      <Button className="w-full" variant="outline" onClick={() => void signIn()} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        {busy ? "Waiting for device…" : "Use Passkey"}
      </Button>
    </div>
  );
};
