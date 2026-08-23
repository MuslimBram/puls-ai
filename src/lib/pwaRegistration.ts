import { registerSW } from "virtual:pwa-register";

const APP_CACHE_NAMES = ["pages-cache", "asset-cache", "image-cache"];

const isPreviewContext = () => {
  const hostname = window.location.hostname;
  return (
    !import.meta.env.PROD ||
    window.self !== window.top ||
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    new URLSearchParams(window.location.search).get("sw") === "off"
  );
};

const clearAppShell = async () => {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => new URL(registration.scope).origin === window.location.origin)
        .map((registration) => registration.unregister()),
    );
  }

  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => APP_CACHE_NAMES.includes(name) || name.includes("workbox-precache"))
        .map((name) => caches.delete(name)),
    );
  }
};

export const initializePWA = async () => {
  if (isPreviewContext()) {
    await clearAppShell();
    return;
  }

  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.location.reload();
    },
    onOfflineReady() {
      console.info("Pulse AI is ready for offline use.");
    },
  });
};