/**
 * Developer-only affordances (instant Dev login, "Dev +15" filler).
 *
 * Server: off in production builds unless GROCER_ALLOW_DEV_LOGIN=1 is set
 * explicitly on the host (never set this on the public Fly app).
 * Client: Next inlines NODE_ENV, so production bundles (Fly, Android WebView)
 * drop the Dev UI entirely.
 */
export const DEV_TOOLS_CLIENT = process.env.NODE_ENV !== "production";

export function devLoginEnabledServer(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.GROCER_ALLOW_DEV_LOGIN === "1";
}
