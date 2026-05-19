import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook. Loads the runtime-appropriate Sentry
 * config. Each config no-ops when SENTRY_DSN is unset (AC7 graceful skip).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
