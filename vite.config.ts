import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const computeManifestVersion = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `1.${mm}.${dd}`;
};

const APP_MANIFEST_VERSION = computeManifestVersion();
const DEFAULT_PUBLIC_SITE_URL = "https://kohablerjeve.top";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/contact",
  "/pricing",
  "/platform",
  "/platform/ai",
  "/platform/unified-inbox",
  "/platform/crm",
  "/platform/marketing",
  "/platform/automation",
  "/platform/analytics",
  "/platform/developers",
  "/platform/partners",
  "/platform/lidhjet",
  "/security",
  "/white-label",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/affiliate-terms",
  "/refund",
  "/terms-and-payments",
] as const;

const BLOCKED_SQ_PATHS = new Set([
  "/white-label",
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/affiliate-terms",
  "/refund",
  "/terms-and-payments",
]);

const PRIVATE_DISCOVERY_PREFIXES = [
  "/admin",
  "/app",
  "/auth",
  "/billing",
  "/business-profile",
  "/dashboard",
  "/inbox",
  "/leads",
  "/login",
  "/oauth",
  "/onboarding",
  "/partner",
  "/public-api",
  "/register",
  "/reset-password",
  "/settings",
  "/unsubscribe",
  "/wallet",
];

function normalizeSiteOrigin(raw?: string) {
  const candidate = (raw || DEFAULT_PUBLIC_SITE_URL).trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function localizedPath(pathname: string, locale: "en" | "sq") {
  return pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
}

function buildDiscoveryPlugin(origin: string): Plugin {
  const indexableUrls = PUBLIC_PATHS.flatMap((pathname) => {
    const en = `${origin}${localizedPath(pathname, "en")}`;
    return BLOCKED_SQ_PATHS.has(pathname)
      ? [en]
      : [en, `${origin}${localizedPath(pathname, "sq")}`];
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexableUrls
    .map((url) => `  <url><loc>${url}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

  const robots = `# Pulse AI — generated public discovery policy\nUser-agent: *\nAllow: /\n${PRIVATE_DISCOVERY_PREFIXES.map(
    (pathname) => `Disallow: ${pathname}`,
  ).join("\n")}\n\nSitemap: ${origin}/sitemap.xml\n`;

  const llms = `# Pulse AI\n\n> Pulse AI — The AI Business Operating System. One intelligent system to run, automate and grow your business.\n\n## Public discovery\n\n- English: ${origin}/en\n- Albanian: ${origin}/sq\n- Platform: ${origin}/en/platform\n- Pricing: ${origin}/en/pricing\n- Security: ${origin}/en/security\n\n## Localization note\n\nSome Albanian legal and white-label pages remain accessible but are intentionally excluded from indexing until approved Albanian body copy exists. No untranslated page is advertised as a full Albanian equivalent.\n`;

  return {
    name: "pulse-public-discovery",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llms });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const publicSiteOrigin = normalizeSiteOrigin(env.VITE_PUBLIC_SITE_URL);

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-query": ["@tanstack/react-query"],
            "vendor-ui": [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tabs",
              "@radix-ui/react-select",
              "@radix-ui/react-popover",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-accordion",
              "@radix-ui/react-toast",
              "@radix-ui/react-checkbox",
              "@radix-ui/react-switch",
              "@radix-ui/react-scroll-area",
              "@radix-ui/react-separator",
            ],
            "vendor-charts": ["recharts"],
            "vendor-supabase": ["@supabase/supabase-js"],
            "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
            "vendor-misc": ["date-fns", "clsx", "tailwind-merge", "class-variance-authority", "cmdk", "sonner", "lucide-react"],
          },
        },
      },
    },
    plugins: [
      react(),
      buildDiscoveryPlugin(publicSiteOrigin),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        includeAssets: [
          "favicon.ico",
          "offline.html",
          "pwa/icon-64.png",
          "pwa/icon-192.png",
          "pwa/icon-512.png",
          "pwa/apple-touch-icon.png",
          "pwa/maskable-icon-512.png",
          "pwa/splash-2048x2732.png",
        ],
        manifest: {
          id: "/",
          name: `Pulse AI v${APP_MANIFEST_VERSION}`,
          short_name: "Pulse AI",
          description: "The intelligent business platform — manage, automate, and grow your business with AI.",
          theme_color: "#0a1628",
          background_color: "#0a1628",
          display: "standalone",
          orientation: "any",
          scope: "/",
          start_url: "/",
          categories: ["business", "productivity"],
          icons: [
            {
              src: "/pwa/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/pwa/maskable-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api/, /^\/~oauth/],
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          additionalManifestEntries: [{ url: "/offline.html", revision: APP_MANIFEST_VERSION }],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === "document",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages-cache",
                networkTimeoutSeconds: 10,
                plugins: [
                  {
                    handlerDidError: async () => (globalThis as any).caches?.match("/offline.html"),
                  },
                ],
              },
            },
            {
              urlPattern: ({ request }) => ["style", "script", "worker"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "asset-cache",
              },
            },
            {
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "image-cache",
                expiration: {
                  maxEntries: 64,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        react: path.resolve(__dirname, "./node_modules/react"),
        "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      },
    },
  };
});
