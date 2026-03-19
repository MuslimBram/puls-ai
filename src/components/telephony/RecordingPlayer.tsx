import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCallRecording, CallRecording } from "@/hooks/useCallRecording";
import { Circle, Square, Play, Pause, FileText, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface RecordingPlayerProps {
  callRecordId?: string | null;
  activeCallId?: string;
  showControls?: boolean;
}

export const RecordingPlayer = ({ callRecordId, activeCallId, showControls = true }: RecordingPlayerProps) => {
  const { isRecording, startRecording, stopRecording, recordings, requestTranscription } = useCallRecording();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  const handlePlay = (recording: CallRecording) => {
    if (playingId === recording.id) {
      audioElement?.pause();
      setPlayingId(null);
      return;
    }
    if (audioElement) audioElement.pause();
    if (!recording.storage_url) return;
    const audio = new Audio(recording.storage_url);
    audio.onended = () => setPlayingId(null);
    audio.play();
    setAudioElement(audio);
    setPlayingId(recording.id);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-semibold">Recordings</CardTitle>
        {showControls && (
          <Button
            size="sm"
            variant={isRecording ? "destructive" : "outline"}
            className="h-7 text-xs gap-1"
            onClick={() => isRecording ? stopRecording() : startRecording(activeCallId, callRecordId || undefined)}
          >
            {isRecording ? (
              <><Square className="h-3 w-3" /> Stop</>
            ) : (
              <><Circle className="h-3 w-3 text-destructive" /> Record</>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isRecording && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 animate-pulse">
            <Circle className="h-3 w-3 text-destructive fill-destructive" />
            <span className="text-xs font-medium text-destructive">Recording in progress...</span>
          </div>
        )}

        {recordings.length === 0 && !isRecording ? (
          <p className="text-xs text-muted-foreground text-center py-4">No recordings yet.</p>
        ) : (
          recordings.map((rec) => (
            <div key={rec.id} className="flex items-center gap-2 rounded-md border border-border p-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => handlePlay(rec)}
                disabled={!rec.storage_url}
              >
                {playingId === rec.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {format(parseISO(rec.created_at), "MMM d, HH:mm")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDuration(rec.duration_seconds)} · {formatSize(rec.file_size_bytes)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className={cn("text-[10px]",
                    rec.transcription_status === "completed" && "border-green-500/50 text-green-600",
                    rec.transcription_status === "processing" && "border-yellow-500/50 text-yellow-600",
                    rec.transcription_status === "pending" && "border-muted text-muted-foreground",
                  )}
                >
                  {rec.transcription_status}
                </Badge>
                {rec.transcription_status === "pending" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => requestTranscription.mutate(rec.id)}
                  >
                    <FileText className="h-3 w-3" />
                  </Button>
                )}
                {rec.storage_url && (
                  <a href={rec.storage_url} download className="inline-flex">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Download className="h-3 w-3" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        {recordings.some((r) => r.transcription) && (
          <div className="border-t border-border pt-2 mt-2">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Latest Transcription</p>
            <p className="text-xs text-foreground whitespace-pre-wrap">
              {recordings.find((r) => r.transcription)?.transcription}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
