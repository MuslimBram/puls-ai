import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export type LeahSession = {
  id: string;
  workspaceId: string;
  userId: string;
  expiresAt: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}

export function randomSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function rejectWorkspaceInjection(body: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(body, "workspace_id") ||
      Object.prototype.hasOwnProperty.call(body, "workspaceId")) {
    throw new Error("workspace_id is server-derived and must not be supplied");
  }
}

export async function resolveLeahSession(
  req: Request,
  admin: SupabaseClient,
): Promise<LeahSession> {
  const raw = req.headers.get("X-Leah-Session")?.trim();
  if (!raw || raw.length < 32 || raw.length > 256) {
    throw new Error("LEAH session required");
  }

  const tokenHash = await sha256Hex(raw);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("leah_access_sessions")
    .select("id, workspace_id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("LEAH session invalid or expired");

  const { error: touchError } = await admin
    .from("leah_access_sessions")
    .update({ last_used_at: now })
    .eq("id", data.id)
    .eq("token_hash", tokenHash);
  if (touchError) throw touchError;

  return {
    id: data.id,
    workspaceId: data.workspace_id,
    userId: data.user_id,
    expiresAt: data.expires_at,
  };
}
