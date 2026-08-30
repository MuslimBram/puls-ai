import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "pulse_security_session_id";
const getSessionId = () => {
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
};

export const useSecurityPresence = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const heartbeat = async () => {
      if (stopped) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.functions.invoke("security-heartbeat", {
        body: { session_id: getSessionId() },
      }).catch(() => undefined);
    };

    void heartbeat();
    const timer = window.setInterval(heartbeat, 2 * 60 * 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
};
