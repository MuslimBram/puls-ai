import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const nextRaw = params.get("next");
    const safeNext = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

    let cancelled = false;
    const go = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        window.location.replace(safeNext);
      } else {
        const sub = supabase.auth.onAuthStateChange((_e, session) => {
          if (session) {
            sub.data.subscription.unsubscribe();
            window.location.replace(safeNext);
          }
        });
        // Fallback after a short wait: send to login preserving next
        setTimeout(() => {
          if (cancelled) return;
          navigate(`/login?next=${encodeURIComponent(safeNext)}`, { replace: true });
        }, 4000);
      }
    };
    go();
    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </main>
  );
}
