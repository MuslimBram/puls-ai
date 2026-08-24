import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { validateInternalPath } from "@/lib/safeNavigate";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const safeNext = validateInternalPath(params.get("next")) ?? "/dashboard";

    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const go = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        window.location.replace(safeNext);
        return;
      }

      const sub = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session || cancelled) return;
        sub.data.subscription.unsubscribe();
        unsubscribe = null;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        window.location.replace(safeNext);
      });
      unsubscribe = () => sub.data.subscription.unsubscribe();

      // Fallback after a short wait: send to login preserving the validated next path.
      fallbackTimer = setTimeout(() => {
        if (cancelled) return;
        unsubscribe?.();
        unsubscribe = null;
        navigate(`/login?next=${encodeURIComponent(safeNext)}`, { replace: true });
      }, 4000);
    };

    go();
    return () => {
      cancelled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, [navigate, params]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </main>
  );
}
