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

// Force clear ALL stale caches on load to prevent offline/stale errors
if ("caches" in window) {
  caches.keys().then((names) => {
    names.forEach((n) => {
      if (n.startsWith("workbox-precache") || n === "pages-cache") {
        caches.delete(n);
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
