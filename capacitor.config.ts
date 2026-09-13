import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wraps the hosted Next.js app in a WebView (Android + iOS).
 * Same appId on both platforms. API routes need a running backend —
 * set CAPACITOR_SERVER_URL accordingly, then: npm run cap:sync
 *
 * Dev (Android emulator → host machine):
 *   CAPACITOR_SERVER_URL=http://10.0.2.2:3000
 * Dev (iOS Simulator → host machine):
 *   CAPACITOR_SERVER_URL=http://localhost:3000
 * Dev (physical device on LAN):
 *   CAPACITOR_SERVER_URL=http://192.168.x.x:3000
 * Production:
 *   CAPACITOR_SERVER_URL=https://your-grocer-host.example
 *
 * Default below targets Android emulator (Phase 2 primary). Override for iOS.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() ||
  "http://10.0.2.2:3000";

const useCleartext = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.cascadialabs.grocer",
  appName: "Grocer",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: useCleartext,
  },
  android: {
    allowMixedContent: useCleartext,
  },
  // iOS uses server.cleartext for local http:// URLs (ATS). Deep link scheme
  // grocer:// lives in ios/App/App/Info.plist — see docs/IOS.md.
};

export default config;
