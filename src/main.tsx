import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import "./i18n";

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

// Force clear the stale runtime pages-cache on load to prevent serving an
// outdated build after a deploy. We deliberately do NOT touch any
// "workbox-precache-*" cache here: workbox already version-manages and
// replaces its own precache automatically on every service worker update,
// and that precache is also where offline.html lives (via
// additionalManifestEntries in vite.config.ts) — clearing it manually here
// would risk deleting the offline fallback right when it's needed most.
if ("caches" in window) {
  caches.keys().then((names) => {
    names.forEach((n) => {
      if (n === "pages-cache") {
        caches.delete(n);
      }
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);

