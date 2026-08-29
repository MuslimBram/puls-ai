import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

/**
 * Keep browser OAuth callbacks on the current origin and canonical callback path.
 * A root redirect is normalized to /auth/callback; malformed/cross-origin targets
 * fail closed to the same canonical callback.
 */
export function normalizeRedirectUri(raw?: string) {
  const fallback = `${window.location.origin}/auth/callback`;
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;

    const isRoot = parsed.pathname === "/" || parsed.pathname === "";
    if (isRoot) parsed.pathname = "/auth/callback";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export const oauth = {
  auth: {
    signInWithOAuth: async (provider: "google" | "facebook" | "apple", opts?: SignInOptions) => {
      const redirectTo = normalizeRedirectUri(opts?.redirect_uri);

      // Register flows must complete MFA after the provider callback. The flag is
      // browser-local and is only written while the user is on /register, so a
      // normal login is never upgraded into a mandatory enrollment flow.
      if (window.location.pathname === "/register") {
        localStorage.setItem("registration_mfa_required", "1");
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
