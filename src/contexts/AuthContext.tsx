import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let bootstrappingUserId: string | null = null;

    const bootstrapUser = async (nextSession: Session) => {
      if (bootstrappingUserId === nextSession.user.id) return;
      bootstrappingUserId = nextSession.user.id;
      const { error } = await supabase.rpc("ensure_current_user_bootstrap" as any);
      if (error) {
        console.error("[Auth] ensure_current_user_bootstrap failed:", error.message);
      }
    };

    const syncSession = (nextSession: Session | null) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      if (nextSession?.user) void bootstrapUser(nextSession);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (_event === "PASSWORD_RECOVERY") {
          // Redirect to reset password page on recovery event
          window.location.href = "/reset-password";
          return;
        }
        syncSession(nextSession);
      }
    );

    const sessionTimeout = window.setTimeout(() => syncSession(null), 8000);
    supabase.auth.getSession()
      .then(({ data: { session: nextSession } }) => {
        window.clearTimeout(sessionTimeout);
        syncSession(nextSession);
      })
      .catch((error: unknown) => {
        window.clearTimeout(sessionTimeout);
        console.error("[Auth] Session recovery failed:", error);
        syncSession(null);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(sessionTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
