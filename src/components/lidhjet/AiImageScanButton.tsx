import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

interface AiImageScanButtonProps {
  imageUrl: string;
  postId?: string;
}

interface ScanResult {
  safe: boolean;
  confidence: number;
  label: string;
  flags?: string[];
}

export function AiImageScanButton({ imageUrl, postId }: AiImageScanButtonProps) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const handleScanImage = async () => {
    if (!imageUrl) return;
    setScanning(true);

    const requestId = requestIdRef.current ?? `req_scan_${crypto.randomUUID()}`;
    requestIdRef.current = requestId;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/community-scan-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          image_url: imageUrl,
          post_id: postId || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || resData.message || "AI image scan failed");
      }

      const result = resData.scan_result as ScanResult;
      setScanResult(result);
      toast({
        title: result.safe ? "AI Scan Result" : "Image Flagged",
        description: result.safe
          ? "Image classifier returned a safe verdict."
          : `Image requires moderation review (${result.label}).`,
        variant: result.safe ? "default" : "destructive",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to scan image";
      toast({
        title: "Scan Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  if (scanResult) {
    if (!scanResult.safe) {
      return (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded">
          <ShieldAlert className="h-3 w-3" />
          <span>
            Flagged: {scanResult.label} ({Math.round(scanResult.confidence * 100)}%)
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
        <ShieldCheck className="h-3 w-3" />
        <span>Classifier Safe ({Math.round(scanResult.confidence * 100)}%)</span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleScanImage}
      disabled={scanning}
      className="h-6 text-[10px] px-2 gap-1 text-muted-foreground hover:text-foreground"
    >
      {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
      {scanning ? "Scanning..." : "AI Safety Scan"}
    </Button>
  );
}
