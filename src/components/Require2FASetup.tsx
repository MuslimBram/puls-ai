// Enforce mandatory MFA at the protected-app boundary.
// The login page handles the interactive challenge; this guard closes
// session-restore/OAuth/email-confirmation paths that could otherwise enter
// the protected app at AAL1.

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
  /** Optional role filter. When omitted, MFA is mandatory for every authenticated user. */
  requiredForRoles?: string[];
}

const EXEMPT_PATHS = ["/session-security", "/login", "/logout", "/complete-payment"];

export const Require2FASetup = ({ children, requiredForRoles }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (EXEMPT_PATHS.some((path) => location.pathname.startsWith(path))) {
      setChecked(true);
      return;
    }

    setChecked(false);

    const check = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session?.user) {
          if (!cancelled) setChecked(true);
          return;
        }

        if (requiredForRoles?.length) {
          const { data: roles, error: rolesError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", session.user.id)
            .in("role", requiredForRoles as never);
          if (rolesError) throw rolesError;
          if (!roles?.length) {
            if (!cancelled) setChecked(true);
            return;
          }
        }

        const { data: aal, error: aalError } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;

        if (aal.currentLevel === "aal2") {
          if (!cancelled) setChecked(true);
          return;
        }

        if (aal.nextLevel === "aal2") {
          // A verified factor exists, but this session has not completed MFA.
          // Return to the login challenge instead of rendering protected UI.
          await supabase.auth.signOut();
          if (!cancelled) {
            navigate(
              `/login?next=${encodeURIComponent(location.pathname + location.search)}&reason=mfa_required`,
              { replace: true },
            );
          }
          return;
        }

        // No verified factor exists. Force mandatory enrollment before access.
        if (!cancelled) {
          navigate(
            `/session-security?require_2fa=true&reason=mandatory_mfa&next=${encodeURIComponent(
              location.pathname + location.search,
            )}`,
            { replace: true },
          );
        }
      } catch (error) {
        console.error("[Auth] Mandatory MFA check failed:", error);
        if (!cancelled) {
          await supabase.auth.signOut();
          navigate(
            `/login?next=${encodeURIComponent(location.pathname + location.search)}&reason=mfa_check_failed`,
            { replace: true },
          );
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [navigate, location.pathname, location.search, requiredForRoles]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
};
