import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Minimal self-contained server bundle for the `web` Docker image.
  output: "standalone",
  // DEV-ONLY: Next 16 blocks /_next/* dev resources from origins other
  // than localhost (cross-origin safety). Real-device manual testing
  // (iOS Safari / Android over the LAN) needs the machine's LAN IP
  // allow-listed, otherwise the client bundle never loads, the page
  // can't hydrate, and every button is dead. Ignored in production —
  // add/replace IPs here when the LAN address changes.
  allowedDevOrigins: ["192.168.1.8"],
};

// withSentryConfig only adds build instrumentation; with no Sentry auth/DSN
// it skips source-map upload and does NOT fail the build (AC7 graceful).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // org/project/authToken intentionally omitted at scaffold stage — Story
  // 1.1 only wires runtime capture; release/sourcemap upload comes later.
});
