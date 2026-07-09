// src/components/Require2FASetup.tsx
// ============================================================
// P1 FIX: 2FA enforce për admin dhe super_admin
// Para: kthen vetëm children pa asnjë kontroll (no-op)
// Pas:  kontrollon TOTP verification; ridrejton te /security nëse mungon
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: React.ReactNode;
  /** Rolet që kërkojnë 2FA. Default: admin dhe super_admin */
  requiredForRoles?: string[];
}

export const Require2FASetup = ({
  children,
  requiredForRoles = ["admin", "super_admin"],
}: Props) => {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

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
          .in("role", requiredForRoles);

        const needsCheck = roles && roles.length > 0;
        if (!needsCheck) { setChecked(true); return; }

        // 3. Kontrollo nëse ka TOTP të konfiguruar dhe të verifikuar
        //    Supabase ruan AAL (Assurance Assurance Level) te sesioni
        //    AAL2 = 2FA e kaluar; AAL1 = vetëm fjalëkalim
        const aal = session.user?.factors?.length ?? 0;
        const hasVerified2FA = aal > 0 &&
          (session as unknown as { aal?: string }).aal === "aal2";

        // Alternativa: kontrollo kolonën tonë të TOTP nëse e kemi
        if (!hasVerified2FA) {
          const { data: totp } = await supabase
            .from("user_totp_settings")
            .select("is_enabled, is_verified")
            .eq("user_id", userId)
            .maybeSingle();

          const totpEnabled = totp?.is_enabled && totp?.is_verified;

          if (!totpEnabled && !cancelled) {
            // Ridrejto te faqja e sigurisë me mesazh të qartë
            navigate(
              "/security?require_2fa=true&reason=admin_role",
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
