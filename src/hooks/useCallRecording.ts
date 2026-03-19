import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "@/components/ui/sonner";

export interface CallRecording {
  id: string;
  workspace_id: string;
  call_record_id: string | null;
  active_call_id: string | null;
  agent_user_id: string | null;
  storage_path: string | null;
  storage_url: string | null;
  duration_seconds: number;
  file_size_bytes: number;
  format: string;
  transcription: string | null;
  transcription_status: string;
  ai_summary: string | null;
  sentiment_score: number | null;
  created_at: string;
}

export const useCallRecording = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // List recordings for a call
  const useRecordingsForCall = (callRecordId: string | null) =>
    useQuery({
      queryKey: ["call-recordings", callRecordId],
      queryFn: async () => {
        if (!callRecordId) return [];
        const { data, error } = await supabase
          .from("call_recordings")
          .select("*")
          .eq("call_record_id", callRecordId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as unknown as CallRecording[];
      },
      enabled: !!callRecordId,
    });

  // All workspace recordings
  const recordingsQuery = useQuery({
    queryKey: ["call-recordings-all", workspace?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_recordings")
        .select("*")
        .eq("workspace_id", workspace!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as CallRecording[];
    },
    enabled: !!workspace,
  });

  // Start recording
  const startRecording = useCallback(async (activeCallId?: string, callRecordId?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const fileName = `recording-${Date.now()}.webm`;
        const storagePath = `${workspace?.id}/${user?.id}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("generated-media")
          .upload(storagePath, blob, { contentType: "audio/webm" });

        if (uploadError) {
          toast.error("Failed to save recording");
          return;
        }

        const { data: urlData } = supabase.storage
          .from("generated-media")
          .getPublicUrl(storagePath);

        // Save recording record
        const { error } = await supabase.from("call_recordings").insert({
          workspace_id: workspace!.id,
          call_record_id: callRecordId || null,
          active_call_id: activeCallId || null,
          agent_user_id: user!.id,
          storage_path: storagePath,
          storage_url: urlData.publicUrl,
          duration_seconds: Math.floor(blob.size / 16000), // rough estimate
          file_size_bytes: blob.size,
          format: "webm",
        } as any);

        if (error) toast.error("Failed to save recording metadata");
        else {
          toast.success("Recording saved");
          qc.invalidateQueries({ queryKey: ["call-recordings"] });
        }

        // Cleanup stream
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(1000); // collect data every second
      setIsRecording(true);
      toast.info("Recording started");
    } catch (err) {
      toast.error("Microphone access denied");
    }
  }, [workspace, user, qc]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Request transcription via AI
  const requestTranscription = useMutation({
    mutationFn: async (recordingId: string) => {
      await supabase
        .from("call_recordings")
        .update({ transcription_status: "processing", updated_at: new Date().toISOString() } as any)
        .eq("id", recordingId);
      // In production this would call an edge function to process transcription
      toast.info("Transcription queued for processing");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-recordings"] }),
  });

  return {
    isRecording,
    startRecording,
    stopRecording,
    recordings: recordingsQuery.data ?? [],
    useRecordingsForCall,
    requestTranscription,
  };
};
