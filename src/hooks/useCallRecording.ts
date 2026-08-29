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

async function attachSignedRecordingUrls(rows: CallRecording[]) {
  return Promise.all(rows.map(async (recording) => {
    if (!recording.storage_path) return { ...recording, storage_url: null };
    const { data, error } = await supabase.storage
      .from("recordings")
      .createSignedUrl(recording.storage_path, 60 * 60);
    return {
      ...recording,
      storage_url: error ? null : data.signedUrl,
    };
  }));
}

export const useCallRecording = () => {
  const { user } = useAuth();
  const { workspace } = useWorkspace();
  const qc = useQueryClient();
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  const useRecordingsForCall = (callRecordId: string | null) =>
    useQuery({
      queryKey: ["call-recordings", workspace?.id, callRecordId],
      queryFn: async () => {
        if (!callRecordId || !workspace?.id) return [];
        const { data, error } = await supabase
          .from("call_recordings")
          .select("*")
          .eq("workspace_id", workspace.id)
          .eq("call_record_id", callRecordId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return attachSignedRecordingUrls((data ?? []) as unknown as CallRecording[]);
      },
      enabled: !!workspace?.id && !!callRecordId,
    });

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
      return attachSignedRecordingUrls((data ?? []) as unknown as CallRecording[]);
    },
    enabled: !!workspace?.id,
  });

  const startRecording = useCallback(async (activeCallId?: string, callRecordId?: string) => {
    if (!workspace?.id || !user?.id) {
      toast.error("Workspace is required before recording");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const fileName = `recording-${Date.now()}.webm`;
        const storagePath = `${workspace.id}/${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("recordings")
          .upload(storagePath, blob, { contentType: "audio/webm" });

        if (uploadError) {
          toast.error("Failed to save recording");
          return;
        }

        const { error } = await supabase.from("call_recordings").insert({
          workspace_id: workspace.id,
          call_record_id: callRecordId || null,
          active_call_id: activeCallId || null,
          agent_user_id: user.id,
          storage_path: storagePath,
          storage_url: null,
          duration_seconds: durationSeconds,
          file_size_bytes: blob.size,
          format: "webm",
        } as any);

        if (error) {
          await supabase.storage.from("recordings").remove([storagePath]);
          toast.error("Failed to save recording metadata");
        } else {
          toast.success("Recording saved");
          qc.invalidateQueries({ queryKey: ["call-recordings"] });
          qc.invalidateQueries({ queryKey: ["call-recordings-all"] });
        }

        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(1000);
      setIsRecording(true);
      toast.info("Recording started");
    } catch {
      toast.error("Microphone access denied");
    }
  }, [workspace, user, qc]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const requestTranscription = useMutation({
    mutationFn: async (recordingId: string) => {
      const { data, error } = await supabase.functions.invoke("transcribe-recording", {
        body: { recording_id: recordingId },
      });
      if (error) throw new Error(error.message || "Transcription request failed");
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["call-recordings"] });
      qc.invalidateQueries({ queryKey: ["call-recordings-all"] });
      toast.success("Transcription completed");
    },
    onError: (e: Error) => toast.error(e.message),
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
