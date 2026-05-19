import * as Sentry from "@sentry/nextjs";

// Client-side Sentry. No DSN -> no init -> no crash (AC7 graceful skip).
// Only NEXT_PUBLIC_* env is inlined into the client bundle; a bare
// SENTRY_DSN fallback here would be dead code (and, if ever inlined, a
// server-secret leak), so it is intentionally NOT used client-side.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  const rate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  Sentry.init({
    dsn,
    // Never sample 100% in production by default (trace cost + PII).
    // Override via NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number.isFinite(rate)
      ? rate
      : process.env.NODE_ENV === "production"
        ? 0.1
        : 1,
    environment: process.env.NODE_ENV,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
