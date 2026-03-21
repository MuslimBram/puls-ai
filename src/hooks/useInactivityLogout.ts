import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 2 * 60 * 1000; // warn 2 min before
const SESSION_FINGERPRINT_KEY = "pulse_session_fp";

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

  // Simple hash
  const str = components.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export const useInactivityLogout = (onWarning?: () => void) => {
  const { signOut, user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const warningRef = useRef<ReturnType<typeof setTimeout>>();

  // Session fingerprint check — detect if session was stolen
  useEffect(() => {
    if (!user) return;

    const currentFp = getBrowserFingerprint();
    const storedFp = sessionStorage.getItem(SESSION_FINGERPRINT_KEY);

    if (!storedFp) {
      sessionStorage.setItem(SESSION_FINGERPRINT_KEY, currentFp);
    } else if (storedFp !== currentFp) {
      // Fingerprint mismatch — potential session hijacking
      console.warn("Session fingerprint mismatch detected — signing out");
      sessionStorage.removeItem(SESSION_FINGERPRINT_KEY);
      signOut();
    }
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
