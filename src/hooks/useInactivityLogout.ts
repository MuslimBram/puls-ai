import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 2 * 60 * 1000; // warn 2 min before
const SESSION_FINGERPRINT_KEY = "pulse_session_fp";
const MAINTENANCE_START_HOUR = 3; // 03:00
const MAINTENANCE_END_HOUR = 5;   // 05:00
const MAINTENANCE_CHECK_INTERVAL = 60 * 1000; // check every 60s

/** Generate a simple browser fingerprint to detect session hijacking */
function getBrowserFingerprint(): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx?.fillText("fp", 0, 0);

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    screen.colorDepth?.toString() || "",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency?.toString() || "",
  ];

  const str = components.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function isMaintenanceWindow(): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= MAINTENANCE_START_HOUR && hour < MAINTENANCE_END_HOUR;
}

export const useInactivityLogout = (onWarning?: () => void) => {
  const { signOut, user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();
  const maintenanceRef = useRef<ReturnType<typeof setInterval>>();

  // Session fingerprint check
  useEffect(() => {
    if (!user) return;

    const currentFp = getBrowserFingerprint();
    const storedFp = sessionStorage.getItem(SESSION_FINGERPRINT_KEY);

    if (!storedFp) {
      sessionStorage.setItem(SESSION_FINGERPRINT_KEY, currentFp);
    } else if (storedFp !== currentFp) {
      console.warn("Session fingerprint mismatch detected — signing out");
      sessionStorage.removeItem(SESSION_FINGERPRINT_KEY);
      signOut();
    }
  }, [user, signOut]);

  // Maintenance window auto-logout (03:00 - 05:00)
  useEffect(() => {
    if (!user) return;

    // Check immediately
    if (isMaintenanceWindow()) {
      console.info("[Security] Maintenance window (03:00-05:00) — auto logout");
      signOut();
      return;
    }

    // Poll every minute
    maintenanceRef.current = setInterval(() => {
      if (isMaintenanceWindow()) {
        console.info("[Security] Maintenance window (03:00-05:00) — auto logout");
        signOut();
      }
    }, MAINTENANCE_CHECK_INTERVAL);

    return () => {
      if (maintenanceRef.current) clearInterval(maintenanceRef.current);
    };
  }, [user, signOut]);

  const resetTimer = useCallback(() => {
    if (!user) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    warningRef.current = setTimeout(() => {
      onWarning?.();
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

    timerRef.current = setTimeout(() => {
      signOut();
    }, INACTIVITY_TIMEOUT);
  }, [user, signOut, onWarning]);

  useEffect(() => {
    if (!user) return;

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    const handler = () => resetTimer();

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimer]);
};
