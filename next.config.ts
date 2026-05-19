import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Minimal self-contained server bundle for the `web` Docker image.
  output: "standalone",
};

// withSentryConfig only adds build instrumentation; with no Sentry auth/DSN
// it skips source-map upload and does NOT fail the build (AC7 graceful).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // org/project/authToken intentionally omitted at scaffold stage — Story
  // 1.1 only wires runtime capture; release/sourcemap upload comes later.
});
