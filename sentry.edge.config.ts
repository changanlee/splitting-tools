import * as Sentry from "@sentry/nextjs";

// Edge runtime init. No DSN -> no-op (graceful skip, AC7).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  Sentry.init({
    dsn,
    // Never sample 100% in production by default (trace cost + PII).
    // Override via SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number.isFinite(rate)
      ? rate
      : process.env.NODE_ENV === "production"
        ? 0.1
        : 1,
    environment: process.env.NODE_ENV,
  });
}
