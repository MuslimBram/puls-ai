import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export function normalizeRedirectUri(raw?: string) {
  const fallback = `${window.location.origin}/auth/callback`;
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    if (parsed.pathname === "/" || parsed.pathname === "") parsed.pathname = "/auth/callback";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export const oauth = {
  auth: {
    signInWithOAuth: async (provider: "google" | "facebook" | "apple", opts?: SignInOptions) => {
      const redirectTo = normalizeRedirectUri(opts?.redirect_uri);
      const isRegistration = window.location.pathname === "/register";

      if (isRegistration) {
        const accountType = sessionStorage.getItem("registration_account_type");
        const params = new URLSearchParams(window.location.search);
        localStorage.setItem("registration_mfa_required", "1");
        localStorage.setItem("pending_social_registration", JSON.stringify({
          ...(accountType ? { account_type: accountType } : {}),
          billing_plan: "standard",
          billing_duration: "trial",
          ...(params.get("ref") ? { referral_code: params.get("ref") } : {}),
          ...(params.get("source") ? { signup_source: params.get("source") } : {}),
        }));
      } else {
        localStorage.removeItem("registration_mfa_required");
        localStorage.removeItem("pending_social_registration");
        sessionStorage.removeItem("registration_account_type");
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: opts?.extraParams,
        },
      });

      return {
        redirected: Boolean(data?.url) && !error,
        url: data?.url ?? null,
        error,
      };
    },
  },
};
