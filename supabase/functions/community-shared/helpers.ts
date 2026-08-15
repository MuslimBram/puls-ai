// supabase/functions/community-shared/helpers.ts
// Shared utilities for Lidhjet 12 Native Edge Functions

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400, code?: string, details?: unknown) {
  return new Response(
    JSON.stringify({ error: message, code: code || "ERROR", details }),
    {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    }
  );
}

export function createSupabaseClients(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  return { userClient, adminClient };
}

export async function getAuthUser(req: Request, userClient: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized user token");
  }

  return user;
}

/**
 * Server-side Contact Information Detector (Phone numbers, Emails, Messaging links, Social handles)
 */
export function detectContactInformation(text: string): { hasContact: boolean; type?: string; match?: string } {
  if (!text) return { hasContact: false };

  // 1. Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    return { hasContact: true, type: "email", match: emailMatch[0] };
  }

  // 2. Social / Messaging URLs (whatsapp, telegram, instagram, facebook, viber, signal)
  const linkRegex = /(wa\.me|t\.me|telegram\.me|whatsapp\.com|instagram\.com|facebook\.com|viber\.com)\/[A-Za-z0-9_.-]+/i;
  const linkMatch = text.match(linkRegex);
  if (linkMatch) {
    return { hasContact: true, type: "messaging_link", match: linkMatch[0] };
  }

  // 3. Social Handles (e.g. @my_handle, ig: handle)
  const handleRegex = /\b(ig|insta|telegram|tg|whatsapp|wa|viber)\s*[:=]\s*@?[A-Za-z0-9_.-]+/i;
  const handleMatch = text.match(handleRegex);
  if (handleMatch) {
    return { hasContact: true, type: "social_handle", match: handleMatch[0] };
  }

  // 4. Phone numbers (e.g. +355691234567, 0691234567, 068 123 4567, +1-800-555-0199)
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}\b/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch && phoneMatch[0].replace(/\D/g, "").length >= 7) {
    return { hasContact: true, type: "phone", match: phoneMatch[0] };
  }

  return { hasContact: false };
}

/**
 * Resolves AI Workspace in strict frozen order:
 * 1. Explicit validated workspace passed by caller
 * 2. First owned workspace (workspaces.owner_id = user_id)
 * 3. First member workspace (workspace_members)
 * 4. Controlled LIDHJET_SYSTEM_WORKSPACE_ID
 */
export async function resolveAiWorkspace(
  userId: string,
  explicitWorkspaceId: string | null,
  adminClient: ReturnType<typeof createClient>
): Promise<{ workspaceId: string; via: "workspace" | "system" }> {
  // 1. Explicit validated workspace
  if (explicitWorkspaceId) {
    const { data: ws } = await adminClient
      .from("workspaces")
      .select("id, owner_id")
      .eq("id", explicitWorkspaceId)
      .maybeSingle();

    if (ws) {
      if (ws.owner_id === userId) {
        return { workspaceId: ws.id, via: "workspace" };
      }
      const { data: member } = await adminClient
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", explicitWorkspaceId)
        .eq("user_id", userId)
        .maybeSingle();

      if (member) {
        return { workspaceId: ws.id, via: "workspace" };
      }
    }
  }

  // 2. First owned workspace
  const { data: ownedWs } = await adminClient
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownedWs) {
    return { workspaceId: ownedWs.id, via: "workspace" };
  }

  // 3. First member workspace
  const { data: memberWs } = await adminClient
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memberWs) {
    return { workspaceId: memberWs.workspace_id, via: "workspace" };
  }

  // 4. Controlled LIDHJET_SYSTEM_WORKSPACE_ID
  const systemWorkspaceId = Deno.env.get("LIDHJET_SYSTEM_WORKSPACE_ID");
  if (systemWorkspaceId) {
    return { workspaceId: systemWorkspaceId, via: "system" };
  }

  // System workspace ID must be provisioned manually if no workspace found
  return { workspaceId: "00000000-0000-0000-0000-000000000000", via: "system" };
}
