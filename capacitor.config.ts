import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.pulse.bos",
  appName: "Pulse AI",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: ["*.supabase.co", "pulse-bos.com", "www.pulse-bos.com", "kohablerjeve.top", "www.kohablerjeve.top"],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1d4ed8",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#1d4ed8",
    },
  },
};

export default config;
