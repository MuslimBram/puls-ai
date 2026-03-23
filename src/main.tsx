import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-update to latest version
    updateSW(true);
  },
  onOfflineReady() {
    console.info("Pulse AI is ready for offline use.");
  },
});

// Force clear stale caches on load to prevent "page error" from old cached code
if ("caches" in window) {
  caches.keys().then((names) => {
    const stale = names.filter((n) => n.startsWith("workbox-precache"));
    stale.forEach((n) => caches.delete(n));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
