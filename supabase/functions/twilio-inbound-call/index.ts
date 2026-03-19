import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface IvrNode {
  id: string;
  type: "greeting" | "menu" | "transfer" | "voicemail" | "time_check" | "play_message" | "hangup";
  label: string;
  config: Record<string, unknown>;
}

interface IvrEdge {
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => { params[key] = value.toString(); });

    const callSid = params.CallSid;
    const callerNumber = params.From || params.Caller || "unknown";
    const calledNumber = params.To || params.Called || "unknown";
    const callerName = params.CallerName || null;
    const digits = params.Digits || null; // DTMF input from <Gather>

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspace_id");
    const ivrNodeId = url.searchParams.get("ivr_node"); // Current IVR node

    if (!workspaceId) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this number is not configured.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } }
      );
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this service is unavailable.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } }
      );
    }

    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-callback?workspace_id=${workspaceId}`;
    const inboundUrl = `${supabaseUrl}/functions/v1/twilio-inbound-call?workspace_id=${workspaceId}`;

    // If this is an IVR node callback (with digits or node navigation)
    if (ivrNodeId) {
      const twiml = await handleIvrNode(supabase, workspaceId, ivrNodeId, digits, inboundUrl, statusCallbackUrl);
      return new Response(twiml, { headers: { ...corsHeaders, "Content-Type": "application/xml" } });
    }

    // Initial call — create records first
    if (!digits) {
      const { data: callRecord } = await supabase
        .from("call_records")
        .insert({
          user_id: workspace.owner_id,
          workspace_id: workspaceId,
          contact_phone: callerNumber,
          contact_name: callerName,
          call_direction: "inbound",
          call_status: "ringing",
          channel_provider: "twilio",
          external_call_id: callSid,
        })
        .select()
        .single();

      await supabase.from("active_calls").insert({
        workspace_id: workspaceId,
        caller_number: callerNumber,
        callee_number: calledNumber,
        caller_name: callerName,
        direction: "inbound",
        status: "ringing",
        sip_call_id: callSid,
        call_record_id: callRecord?.id || null,
      });
    }

    // Check for active IVR flow
    const { data: ivrFlow } = await supabase
      .from("ivr_flows")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .single();

    if (ivrFlow?.nodes && (ivrFlow.nodes as IvrNode[]).length > 0) {
      // Start IVR flow from first node
      const nodes = ivrFlow.nodes as IvrNode[];
      const edges = ivrFlow.edges as IvrEdge[];

      // Find the greeting/root node (first node or one with no incoming edges)
      const targetIds = new Set(edges.map(e => e.target));
      const rootNode = nodes.find(n => !targetIds.has(n.id)) || nodes[0];

      const twiml = buildIvrNodeTwiml(rootNode, nodes, edges, inboundUrl, statusCallbackUrl);
      return new Response(twiml, { headers: { ...corsHeaders, "Content-Type": "application/xml" } });
    }

    // No IVR — check business hours
    const businessHoursResult = checkBusinessHours(ivrFlow?.settings as Record<string, unknown> | null);

    if (!businessHoursResult.isOpen) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(businessHoursResult.message)}</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Say voice="Polly.Amy">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, { headers: { ...corsHeaders, "Content-Type": "application/xml" } });
    }

    // Find available agent with queue-based routing
    const twiml = await routeToAgent(supabase, workspaceId, callSid, callerNumber, statusCallbackUrl);
    return new Response(twiml, { headers: { ...corsHeaders, "Content-Type": "application/xml" } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("twilio-inbound-call error:", msg);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "application/xml" }, status: 200 }
    );
  }
});

// ─── IVR Runtime Engine ──────────────────────────────────────────

async function handleIvrNode(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  nodeId: string,
  digits: string | null,
  inboundUrl: string,
  statusCallbackUrl: string,
): Promise<string> {
  const { data: ivrFlow } = await supabase
    .from("ivr_flows")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .single();

  if (!ivrFlow) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>IVR configuration not found.</Say><Hangup/></Response>`;
  }

  const nodes = ivrFlow.nodes as IvrNode[];
  const edges = ivrFlow.edges as IvrEdge[];
  const currentNode = nodes.find(n => n.id === nodeId);

  if (!currentNode) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Menu option not found.</Say><Hangup/></Response>`;
  }

  // If we have digits input, find the next node based on the edge condition
  if (digits && currentNode.type === "menu") {
    const matchingEdge = edges.find(e =>
      e.source === nodeId && (e.condition === digits || e.label === digits)
    );

    if (matchingEdge) {
      const nextNode = nodes.find(n => n.id === matchingEdge.target);
      if (nextNode) {
        return buildIvrNodeTwiml(nextNode, nodes, edges, inboundUrl, statusCallbackUrl);
      }
    }

    // Invalid digit — replay current menu
    return buildIvrNodeTwiml(currentNode, nodes, edges, inboundUrl, statusCallbackUrl, true);
  }

  // Default: follow the first outgoing edge
  const nextEdge = edges.find(e => e.source === nodeId);
  if (nextEdge) {
    const nextNode = nodes.find(n => n.id === nextEdge.target);
    if (nextNode) {
      return buildIvrNodeTwiml(nextNode, nodes, edges, inboundUrl, statusCallbackUrl);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you. Goodbye.</Say><Hangup/></Response>`;
}

function buildIvrNodeTwiml(
  node: IvrNode,
  allNodes: IvrNode[],
  edges: IvrEdge[],
  inboundUrl: string,
  statusCallbackUrl: string,
  isRetry = false,
): string {
  const config = node.config || {};

  switch (node.type) {
    case "greeting":
    case "play_message": {
      const message = (config.message as string) || "Welcome.";
      const nextEdge = edges.find(e => e.source === node.id);
      if (nextEdge) {
        const nextNode = allNodes.find(n => n.id === nextEdge.target);
        if (nextNode) {
          // Chain to next node
          return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(message)}</Say>
  <Redirect method="POST">${inboundUrl}&amp;ivr_node=${esc(nextEdge.target)}</Redirect>
</Response>`;
        }
      }
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(message)}</Say>
  <Hangup/>
</Response>`;
    }

    case "menu": {
      const prompt = (config.prompt as string) || "Please select an option.";
      const retryMsg = isRetry ? "Invalid selection. " : "";
      const numDigits = (config.num_digits as number) || 1;
      const timeout = (config.timeout as number) || 5;

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="${numDigits}" timeout="${timeout}" action="${inboundUrl}&amp;ivr_node=${esc(node.id)}" method="POST">
    <Say voice="Polly.Amy">${esc(retryMsg + prompt)}</Say>
  </Gather>
  <Say voice="Polly.Amy">We didn't receive any input. Goodbye.</Say>
  <Hangup/>
</Response>`;
    }

    case "transfer": {
      const transferNumber = (config.number as string) || "";
      const transferQueue = (config.queue_name as string) || "";

      if (transferQueue) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Transferring you now. Please hold.</Say>
  <Enqueue waitUrl="${inboundUrl}&amp;ivr_node=hold_music">${esc(transferQueue)}</Enqueue>
</Response>`;
      }

      if (transferNumber) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Transferring your call now.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST">
    <Number>${esc(transferNumber)}</Number>
  </Dial>
</Response>`;
      }

      // Transfer to available agent via Twilio Client
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while we connect you to an agent.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" timeout="30">
    <Client>agent</Client>
  </Dial>
  <Say voice="Polly.Amy">Sorry, no agents are available. Please try again later.</Say>
  <Hangup/>
</Response>`;
    }

    case "voicemail": {
      const vmMessage = (config.message as string) || "Please leave a message after the beep.";
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(vmMessage)}</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Say voice="Polly.Amy">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
    }

    case "time_check": {
      const result = checkBusinessHours(config as Record<string, unknown>);
      const openEdge = edges.find(e => e.source === node.id && (e.label === "open" || e.condition === "open"));
      const closedEdge = edges.find(e => e.source === node.id && (e.label === "closed" || e.condition === "closed"));

      const targetEdge = result.isOpen ? openEdge : closedEdge;
      if (targetEdge) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${inboundUrl}&amp;ivr_node=${esc(targetEdge.target)}</Redirect>
</Response>`;
      }

      if (!result.isOpen) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(result.message)}</Say>
  <Hangup/>
</Response>`;
      }

      // Default: continue to next edge
      const nextEdge = edges.find(e => e.source === node.id);
      if (nextEdge) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${inboundUrl}&amp;ivr_node=${esc(nextEdge.target)}</Redirect>
</Response>`;
      }
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    }

    case "hangup":
    default: {
      const byeMsg = (config.message as string) || "Thank you for calling. Goodbye.";
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${esc(byeMsg)}</Say>
  <Hangup/>
</Response>`;
    }
  }
}

// ─── Business Hours ──────────────────────────────────────────────

function checkBusinessHours(settings: Record<string, unknown> | null): { isOpen: boolean; message: string } {
  if (!settings?.business_hours) {
    return { isOpen: true, message: "" }; // No hours configured = always open
  }

  const hours = settings.business_hours as Record<string, { open: string; close: string }>;
  const timezone = (settings.timezone as string) || "UTC";

  const now = new Date();
  // Simple timezone offset (production should use Intl.DateTimeFormat)
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[now.getUTCDay()];
  const todayHours = hours[dayName];

  if (!todayHours || !todayHours.open || !todayHours.close) {
    return {
      isOpen: false,
      message: (settings.closed_message as string) || "We are currently closed. Please call back during business hours or leave a message.",
    };
  }

  const [openH, openM] = todayHours.open.split(":").map(Number);
  const [closeH, closeM] = todayHours.close.split(":").map(Number);
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true, message: "" };
  }

  return {
    isOpen: false,
    message: (settings.closed_message as string) || "We are currently closed. Please call back during business hours or leave a message.",
  };
}

// ─── Agent Routing ──────────────────────────────────────────────

async function routeToAgent(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  callSid: string,
  callerNumber: string,
  statusCallbackUrl: string,
): Promise<string> {
  // Get call queues ordered by priority
  const { data: queues } = await supabase
    .from("call_queues")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("priority", { ascending: false });

  // Find available agents
  const { data: agents } = await supabase
    .from("agent_telephony_state")
    .select("user_id, sip_extension, telephony_status, calls_handled_today")
    .eq("workspace_id", workspaceId)
    .eq("telephony_status", "online");

  if (!agents || agents.length === 0) {
    // No agents — queue or voicemail
    await supabase
      .from("active_calls")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("sip_call_id", callSid);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Thank you for calling. All agents are currently busy. Please hold.</Say>
  <Play loop="3">http://com.twilio.sounds.music.s3.amazonaws.com/oldDog_-_endless_goodbye_%28instr.%29.mp3</Play>
  <Say voice="Polly.Amy">Sorry, no agents are available. Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Hangup/>
</Response>`;
  }

  // Route based on queue strategy
  const strategy = queues?.[0]?.strategy || "round_robin";
  let selectedAgent = agents[0];

  if (strategy === "least_busy") {
    selectedAgent = agents.reduce((min, a) =>
      (a.calls_handled_today || 0) < (min.calls_handled_today || 0) ? a : min
    , agents[0]);
  } else if (strategy === "ring_all") {
    // Ring all agents simultaneously using <Dial> with multiple <Client> tags
    const clientTags = agents.map(a => `    <Client>${a.user_id}</Client>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while we connect you.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" timeout="30">
${clientTags}
  </Dial>
  <Say voice="Polly.Amy">Sorry, no agents answered. Please leave a message.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Hangup/>
</Response>`;
  }
  // Default round_robin: pick first available (already sorted)

  // Route to selected agent
  if (selectedAgent.sip_extension) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while we connect you to an agent.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" timeout="30">
    <Sip>${esc(selectedAgent.sip_extension)}</Sip>
  </Dial>
  <Say voice="Polly.Amy">The agent is not available. Please leave a message.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Hangup/>
</Response>`;
  }

  // Route via Twilio Client SDK (browser-based)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while we connect you to an agent.</Say>
  <Dial record="record-from-answer-dual" recordingStatusCallback="${statusCallbackUrl}&amp;event=recording" recordingStatusCallbackMethod="POST" timeout="30">
    <Client>${selectedAgent.user_id}</Client>
  </Dial>
  <Say voice="Polly.Amy">Sorry, no agents answered. Please leave a message.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${statusCallbackUrl}&amp;event=transcription" />
  <Hangup/>
</Response>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
