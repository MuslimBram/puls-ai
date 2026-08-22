import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/security-headers.ts";
import { decryptIfNeeded } from "../_shared/token-utils.ts";
import { getServiceKey } from "../_shared/admin-client.ts";
import { callAIRouter } from "../_shared/ai-router-helper.ts";

const getCors = (req: Request) => buildCorsHeaders(req, { allowAnyOrigin: false });

/**
 * Transcribe a call recording.
 *
 * TRANSCRIPTION APPROACH:
 *   1. Fetch Twilio recording via REST API (server-side, authenticated).
 *   2. Check if Twilio native transcription is available (they provide it on request).
 *   3. If OPENAI_API_KEY is configured → Whisper for actual audio-to-text.
 *      (Whisper audio-to-text is a justified specialized direct provider path.)
 *   4. Post-transcription text analysis (summary, sentiment, intent, etc.) is routed
 *      through the canonical AI Router — no direct Anthropic endpoint used.
 *   5. Feed structured result into Pulse AI Brain (digital twins, memory, leads).
 *
 * NOTE: Step 3 (audio-to-text) requires an STT service (Whisper/Deepgram/AssemblyAI).
 *       Without one, the recording is retrieved and metadata is stored, but no raw
 *       transcript text is available. Set OPENAI_API_KEY for Whisper support.
 *       Twilio native transcription can be enabled per recording in Twilio Console.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCors(req) });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, getServiceKey()!);

  try {
    const authHeader = req.headers.get("authorization");
    // Allow service-role internal calls (from status-callback) or user-initiated
    const isInternal = req.headers.get("x-internal-secret") === Deno.env.get("INTERNAL_WEBHOOK_SECRET");

    if (!isInternal) {
      if (!authHeader) throw new Error("No authorization header");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const uc = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await uc.auth.getUser();
      if (error || !user) throw new Error("Unauthorized");
    }

    const { recording_id, call_sid, workspace_id } = await req.json();

    // Find recording by ID or by call_sid
    let recQuery = sb.from("call_recordings").select("*");
    if (recording_id) recQuery = recQuery.eq("id", recording_id);
    else if (call_sid) recQuery = recQuery.eq("call_sid", call_sid);
    else throw new Error("recording_id or call_sid required");

    const { data: recording, error: re } = await recQuery.single();
    if (re || !recording) throw new Error("Recording not found");

    // SECURITY: Always use recording's STORED workspace_id — ignore request-provided value.
    // Prevents cross-workspace access via forged workspace_id parameter.
    const recordingWorkspaceId: string | null = (recording as any).workspace_id ?? null;

    // For non-internal calls: verify authenticated user is member of recording's workspace
    if (!isInternal && recordingWorkspaceId) {
      const authHdr = req.headers.get("authorization");
      if (authHdr) {
        const { data: { user: auther } } = await createClient(
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHdr } } }
        ).auth.getUser();
        if (auther) {
          const [{ data: isMbr }, { data: isOwnr }, { data: isAdm }] = await Promise.all([
            sb.rpc("is_workspace_member", { _user_id: auther.id, _workspace_id: recordingWorkspaceId }),
            sb.from("workspaces").select("id").eq("id", recordingWorkspaceId).eq("owner_id", auther.id).maybeSingle(),
            sb.from("user_roles").select("role").eq("user_id", auther.id).in("role", ["admin","super_admin"]).maybeSingle(),
          ]);
          if (!isMbr && !isOwnr && !isAdm) {
            throw new Error("Forbidden: recording belongs to a different workspace");
          }
        }
      }
    }

    if (recording.transcription_status === "completed") {
      return new Response(JSON.stringify({ already_done: true, recording_id: recording.id }),
        { headers: { ...getCors(req), "Content-Type": "application/json" } });
    }

    await sb.from("call_recordings")
      .update({ transcription_status: "processing", updated_at: new Date().toISOString() })
      .eq("id", recording.id);

    // ── Resolve Twilio credentials ──────────────────────────────────────────
    const wsId = recordingWorkspaceId;
    let accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    let authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (wsId) {
      const { data: ch } = await sb.from("channels")
        .select("settings")
        .eq("workspace_id", wsId)
        .eq("channel_type", "voip")
        .maybeSingle();
      if (ch?.settings) {
        const s = ch.settings as Record<string, string>;
        if (s.account_sid) accountSid = s.account_sid;
        if (s.auth_token)  authToken  = await decryptIfNeeded(s.auth_token);
      }
    }

    // ── Step 1: Fetch recording metadata from Twilio REST ──────────────────
    let twilioRecordingSid: string | null = recording.twilio_recording_sid ?? null;
    let twilioTranscriptText: string | null = null;
    let audioFetched = false;

    if (accountSid && authToken && twilioRecordingSid) {
      const twilioAuth = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
      const metaRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${twilioRecordingSid}.json`,
        { headers: { Authorization: twilioAuth } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json() as Record<string, unknown>;
        audioFetched = true;

        // Check if Twilio native transcription is available
        if ((meta as any).transcription_sid) {
          const txRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Transcriptions/${(meta as any).transcription_sid}.json`,
            { headers: { Authorization: twilioAuth } }
          );
          if (txRes.ok) {
            const tx = await txRes.json() as any;
            twilioTranscriptText = tx.transcription_text ?? null;
          }
        }
      }
    }

    // ── Step 2: Whisper transcription if OPENAI_API_KEY is configured ───────
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!twilioTranscriptText && openaiKey && accountSid && authToken && twilioRecordingSid) {
      try {
        const twilioAuth = `Basic ${btoa(`${accountSid}:${authToken}`)}`;
        // Fetch audio as MP3
        const audioRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${twilioRecordingSid}.mp3`,
          { headers: { Authorization: twilioAuth } }
        );
        if (audioRes.ok) {
          const audioBlob = await audioRes.blob();
          const form = new FormData();
          form.append("file", audioBlob, "recording.mp3");
          form.append("model", "whisper-1");
          form.append("response_format", "text");
          const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}` },
            body: form,
          });
          if (whisperRes.ok) {
            twilioTranscriptText = await whisperRes.text();
          }
        }
      } catch (e) {
        console.warn("[transcribe] Whisper failed:", e);
      }
    }

    // ── Step 3: Post-transcription analysis via canonical AI Router ─────────
    // NOTE: This must NOT call the Anthropic Messages endpoint directly.
    //       Text analysis (summary, sentiment, intent, etc.) is standard generative
    //       reasoning and MUST use the canonical AI Router.
    //
    // AUTH CONTRACT:
    //   - User-initiated calls: preserve the verified Authorization header so
    //     normal router membership/entitlement semantics apply.
    //   - Internal recording callbacks: use only the server-derived recording
    //     workspace_id with internal service credentials.
    //   - LIMITATION: For internal automation paths the router authorizes access
    //     via service-role + INTERNAL_WEBHOOK_SECRET using the server-derived
    //     workspace_id. Standard per-user entitlement checks (plan limits, per-seat
    //     quotas) do not apply on internal paths because there is no user principal;
    //     only workspace-level authorization is enforced.
    let analysis: Record<string, unknown> = {};
    let summary = "";
    let sentiment: "positive" | "neutral" | "negative" = "neutral";

    const hasRealTranscript = !!twilioTranscriptText;

    const systemPrompt = hasRealTranscript
      ? `You are a call analysis AI for a business CRM. Analyze this call transcript and return JSON with:
{
  "summary": "2-3 sentence summary",
  "sentiment": "positive|neutral|negative",
  "sentiment_score": 0-1,
  "speakers": [{"role": "agent|customer", "tone": string}],
  "language": "detected language code",
  "customer_intent": "primary intent",
  "questions_asked": ["..."],
  "objections": ["..."],
  "products_services_mentioned": ["..."],
  "commitments_promises": ["..."],
  "follow_up_requested": boolean,
  "next_recommended_action": "...",
  "lead_qualified": boolean,
  "booking_requested": boolean,
  "human_handoff_requested": boolean,
  "confidence": 0-1,
  "transcript_source": "twilio_native|whisper|manual"
}`
      : `You are a call analysis AI. Based on call metadata only (no transcript available — STT not configured), provide what analysis you can from duration, status, and context. Return JSON with: {"summary": string, "sentiment": "neutral", "note": "No transcript available — configure OPENAI_API_KEY for Whisper or enable Twilio Transcription", "next_recommended_action": string}`;

    const userContent = hasRealTranscript
      ? `Transcript:\n${twilioTranscriptText!.slice(0, 8000)}`
      : `Call metadata: duration=${recording.duration_seconds}s, recording_sid=${twilioRecordingSid}, workspace=${wsId}`;

    // Build router call options — workspace must always be server-derived from recording.
    // Request-controlled workspace_id is NEVER used as trusted router context.
    const routerOptions = isInternal
      ? {
          // Internal path: service-role + internal secret, server-derived workspace only.
          workspaceId: recordingWorkspaceId ?? undefined,
          taskType: "complex_reasoning",
          maxTokens: 1200,
        }
      : {
          // User-initiated path: preserve the verified Authorization header so
          // standard router membership/entitlement semantics apply.
          authHeader: authHeader ?? undefined,
          workspaceId: recordingWorkspaceId ?? undefined,
          taskType: "complex_reasoning",
          maxTokens: 1200,
        };

    try {
      const raw = await callAIRouter(
        [{ role: "user", content: userContent }],
        systemPrompt,
        routerOptions,
      );
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      summary   = (analysis.summary   as string) ?? "";
      sentiment = (analysis.sentiment as any)    ?? "neutral";
    } catch (e) {
      // Analysis failure must NOT corrupt or lose a successfully obtained transcript.
      // Log the error and proceed with safe default values.
      console.warn("[transcribe] AI Router analysis failed — using safe defaults:", (e as Error).message);
    }

    // ── Step 4: Persist ──────────────────────────────────────────────────────
    const finalTranscript = twilioTranscriptText ?? (
      hasRealTranscript ? twilioTranscriptText :
      "[Transcription not available — configure OPENAI_API_KEY (Whisper) or enable Twilio Transcription]"
    );

    const updateData: Record<string, unknown> = {
      transcription_status: "completed",
      transcription: finalTranscript,
      ai_summary: summary,
      ai_sentiment_score: (analysis.sentiment_score as number) ?? 0.5,
      ai_analysis: analysis,
      updated_at: new Date().toISOString(),
    };

    await sb.from("call_recordings").update(updateData).eq("id", recording.id);

    // ── Step 5: Feed into Pulse AI Brain ─────────────────────────────────────
    if (hasRealTranscript && wsId) {
      // Update lead score if call is linked to a contact
      if (recording.contact_id) {
        await sb.from("leads").update({
          intent_score: (analysis.lead_qualified ? 0.8 : 0.4),
          scored_at: new Date().toISOString(),
        }).eq("id", recording.contact_id).catch(() => {});
      }

      // Store business intelligence evidence
      await sb.from("business_intelligence_evidence").insert({
        workspace_id: wsId,
        source_type: "call_recording",
        source_id: recording.id,
        evidence_type: "call_analysis",
        content: {
          transcript_excerpt: twilioTranscriptText?.slice(0, 500),
          customer_intent: analysis.customer_intent,
          products_mentioned: analysis.products_services_mentioned,
          objections: analysis.objections,
          commitments: analysis.commitments_promises,
        },
        sentiment: sentiment,
        confidence: (analysis.confidence as number) ?? 0.7,
        recorded_at: recording.started_at ?? new Date().toISOString(),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      success: true,
      recording_id: recording.id,
      has_real_transcript: hasRealTranscript,
      transcript_source: analysis.transcript_source ?? (hasRealTranscript ? "available" : "none"),
      sentiment,
      summary,
      stt_note: !hasRealTranscript
        ? "No STT service available. Set OPENAI_API_KEY for Whisper or enable Twilio Transcription."
        : undefined,
    }), { headers: { ...getCors(req), "Content-Type": "application/json" } });

  } catch (e: any) {
    console.error("[transcribe-recording]", e.message);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...getCors(req), "Content-Type": "application/json" } });
  }
});
