import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { getCalcomWorkspaceCredentials, getCalcomEndpointVersion } from "../_shared/calcom-helper.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCors(req), "Content-Type": "application/json" },
  });

export interface SendCalcomPayload {
  workspace_id: string;
  operation: "CREATE_BOOKING" | "RESCHEDULE_BOOKING" | "CANCEL_BOOKING";
  booking_uid?: string;
  event_type_id?: number;
  start?: string;
  reschedule_reason?: string;
  cancellation_reason?: string;
  attendee?: {
    name: string;
    email: string;
    timeZone?: string;
  };
  location?: Record<string, unknown> | string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(req, { error: "Unauthorized: Missing Bearer token" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !user) return json(req, { error: "Unauthorized" }, 401);

  let body: SendCalcomPayload;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Invalid JSON body" }, 400);
  }

  const { workspace_id, operation } = body;
  if (!workspace_id || !operation) {
    return json(req, { error: "workspace_id and operation are required" }, 400);
  }

  // Workspace membership check
  const { data: member } = await supabase.rpc("is_workspace_member", {
    _user_id: user.id,
    _workspace_id: workspace_id,
  });
  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspace_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!member && !owned) {
    return json(req, { error: "Forbidden: Not authorized for this workspace" }, 403);
  }

  const { accessToken } = await getCalcomWorkspaceCredentials(supabase, workspace_id);

  let endpointKey = "";
  let url = "";
  let requestBody: Record<string, unknown> = {};

  switch (operation) {
    case "CREATE_BOOKING": {
      endpointKey = "POST /v2/bookings";
      url = "https://api.cal.com/v2/bookings";
      if (!body.start || !body.event_type_id || !body.attendee) {
        return json(req, { error: "start, event_type_id, and attendee required for CREATE_BOOKING" }, 400);
      }
      requestBody = {
        start: body.start,
        eventTypeId: body.event_type_id,
        attendee: body.attendee,
      };
      if (body.location) {
        requestBody.location = body.location;
      }
      break;
    }
    case "RESCHEDULE_BOOKING": {
      endpointKey = "POST /v2/bookings/{bookingUid}/reschedule";
      if (!body.booking_uid || !body.start) {
        return json(req, { error: "booking_uid and start required for RESCHEDULE_BOOKING" }, 400);
      }
      url = `https://api.cal.com/v2/bookings/${encodeURIComponent(body.booking_uid)}/reschedule`;
      requestBody = {
        start: body.start,
      };
      if (body.reschedule_reason) {
        requestBody.rescheduleReason = body.reschedule_reason;
      }
      break;
    }
    case "CANCEL_BOOKING": {
      endpointKey = "POST /v2/bookings/{bookingUid}/cancel";
      if (!body.booking_uid) {
        return json(req, { error: "booking_uid required for CANCEL_BOOKING" }, 400);
      }
      url = `https://api.cal.com/v2/bookings/${encodeURIComponent(body.booking_uid)}/cancel`;
      if (body.cancellation_reason) {
        requestBody.cancellationReason = body.cancellation_reason;
      }
      break;
    }
    default:
      return json(req, { error: `Unsupported operation: ${operation}` }, 400);
  }

  const calApiVersion = getCalcomEndpointVersion(endpointKey);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "cal-api-version": calApiVersion,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    return json(req, { error: `Cal.com API error (${response.status}): ${errText}` }, response.status);
  }

  const resData = await response.json();
  const returnedUid = resData.data?.uid ?? resData.data?.bookingUid ?? resData.uid ?? resData.bookingUid;

  return json(req, {
    success: true,
    operation,
    workspace_id,
    booking_uid: returnedUid,
    booking: resData.data ?? resData,
  });
});
