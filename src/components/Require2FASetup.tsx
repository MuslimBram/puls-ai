// src/components/Require2FASetup.tsx
// ============================================================
// P1 FIX: 2FA enforce për admin dhe super_admin
// Para: kthen vetëm children pa asnjë kontroll (no-op)
// Pas:  kontrollon TOTP verification; ridrejton te /security nëse mungon
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
  /** Rolet që kërkojnë 2FA. Default: admin dhe super_admin */
  requiredForRoles?: string[];
}

/** Stable module-level default so the effect below does not re-run every render. */
const DEFAULT_ROLES = ["admin", "super_admin"];

/** Pages that must stay reachable, otherwise the redirect loops forever. */
const EXEMPT_PATHS = ["/session-security", "/login", "/logout", "/complete-payment"];

export const Require2FASetup = ({
  children,
  requiredForRoles = DEFAULT_ROLES,
}: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Never enforce on the very page the user is redirected to.
    if (EXEMPT_PATHS.some((p) => location.pathname.startsWith(p))) {
      setChecked(true);
      return;
    }

    // Safety net: never keep the app on a spinner for more than 6s.
    const failSafe = setTimeout(() => {
      if (!cancelled) setChecked(true);
    }, 6000);


    async function check() {
      try {
        // 1. Merr sesionin aktual
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) { setChecked(true); return; }

        const userId = session.user.id;

        // 2. Kontrollo nëse ky përdorues ka ndonjë rol që kërkon 2FA
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .in("role", requiredForRoles as never);

        const needsCheck = roles && roles.length > 0;
        if (!needsCheck) { setChecked(true); return; }

        // 3. Kontrollo nëse ka TOTP të konfiguruar dhe të verifikuar
        const aal = session.user?.factors?.length ?? 0;
        const hasVerified2FA = aal > 0 &&
          (session as unknown as { aal?: string }).aal === "aal2";

        if (!hasVerified2FA) {
          const { data: totp } = await (supabase as unknown as {
            from: (t: string) => {
              select: (c: string) => {
                eq: (k: string, v: string) => {
                  maybeSingle: () => Promise<{ data: { is_enabled?: boolean; is_verified?: boolean } | null }>;
                };
              };
            };
          })
            .from("user_totp_settings")
            .select("is_enabled, is_verified")
            .eq("user_id", userId)
            .maybeSingle();

          const totpEnabled = totp?.is_enabled && totp?.is_verified;

          if (!totpEnabled && !cancelled) {
            // Redirect to the protected session security page
            navigate(
              "/session-security?require_2fa=true&reason=admin_role",
              { replace: true }
            );
            return;
          }
        }

        if (!cancelled) setChecked(true);

      } catch {
        // Nëse kontrolli dështon, lejo hyrjen (mos bloko)
        if (!cancelled) setChecked(true);
      }
    }

    check();
    return () => { cancelled = true; };
  }, [navigate, requiredForRoles]);

  // Mos shfaq asgjë derisa kontrolli përfundon (parandalon flash)
  if (!checked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return <>{children}</>;
};
