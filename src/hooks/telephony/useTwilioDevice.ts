/**
 * Twilio Client SDK device management — lazy-loads the SDK, initializes
 * the Device, and refreshes the token periodically.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";

let twilioDevice: any = null;
let twilioConnection: any = null;
let deviceInitPromise: Promise<void> | null = null;

async function loadTwilioSdk(): Promise<any> {
  if ((window as any).Twilio?.Device) return (window as any).Twilio.Device;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="twilio.min.js"]');
    if (existing) {
      const check = setInterval(() => {
        if ((window as any).Twilio?.Device) { clearInterval(check); resolve((window as any).Twilio.Device); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Twilio SDK load timeout")); }, 10000);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://sdk.twilio.com/js/client/releases/1.14.0/twilio.min.js";
    script.onload = () => {
      const check = setInterval(() => {
        if ((window as any).Twilio?.Device) { clearInterval(check); resolve((window as any).Twilio.Device); }
      }, 100);
      setTimeout(() => { clearInterval(check); reject(new Error("Twilio SDK init timeout")); }, 5000);
    };
    script.onerror = () => reject(new Error("Failed to load Twilio Client SDK"));
    document.head.appendChild(script);
  });
}

export function getTwilioConnection() { return twilioConnection; }
export function setTwilioConnection(conn: any) { twilioConnection = conn; }

export function useTwilioDevice(
  hasWebRtcCredentials: boolean,
  workspaceId: string | undefined,
  userId: string | undefined,
) {
  const qc = useQueryClient();
  const [deviceReady, setDeviceReady] = useState(false);

  useEffect(() => {
    if (!hasWebRtcCredentials || !workspaceId || !userId) return;
    if (deviceInitPromise) return;

    deviceInitPromise = (async () => {
      try {
        const TwilioDevice = await loadTwilioSdk();
        const { data, error } = await supabase.functions.invoke("twilio-token", {
          body: { workspace_id: workspaceId },
        });
        if (error || data?.error) { console.warn("Twilio token error:", data?.error || error?.message); return; }

        twilioDevice = new TwilioDevice(data.token, {
          codecPreferences: ["opus", "pcmu"],
          enableRingingState: true,
        });

        twilioDevice.on("ready", () => { setDeviceReady(true); console.log("Twilio Device ready for WebRTC calls"); });
        twilioDevice.on("incoming", (conn: any) => {
          twilioConnection = conn;
          qc.invalidateQueries({ queryKey: ["active-calls"] });
          toast.info(`Incoming call from ${conn.parameters.From || "Unknown"}`);
        });
        twilioDevice.on("disconnect", () => {
          twilioConnection = null;
          qc.invalidateQueries({ queryKey: ["active-calls"] });
          qc.invalidateQueries({ queryKey: ["agent-telephony-state"] });
        });
        twilioDevice.on("error", (err: any) => { console.error("Twilio Device error:", err); });
      } catch (err) {
        console.warn("Twilio Client SDK not available:", err);
      }
    })();

    return () => {
      if (twilioDevice) { twilioDevice.destroy(); twilioDevice = null; twilioConnection = null; deviceInitPromise = null; setDeviceReady(false); }
    };
  }, [hasWebRtcCredentials, workspaceId, userId]);

  // Refresh token every 50 min
  useEffect(() => {
    if (!deviceReady || !workspaceId) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("twilio-token", { body: { workspace_id: workspaceId } });
        if (data?.token && twilioDevice) twilioDevice.updateToken(data.token);
      } catch { /* ignore */ }
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [deviceReady, workspaceId]);

  return { deviceReady, twilioDevice: twilioDevice as any };
}
