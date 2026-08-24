import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

function normalizeRedirectUri(raw?: string) {
  const fallback = `${window.location.origin}/auth/callback`;
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin) return raw;

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
