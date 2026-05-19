import * as Sentry from "@sentry/nextjs";

// Graceful degradation: no DSN -> no init -> app runs normally, no crash
// (AC7 / Side Project standards: never leak ops config as a hard failure).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  Sentry.init({
    dsn,
    // Never sample 100% in production by default (trace cost + receipt
    // images can carry PII into traces). Override via
    // SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: Number.isFinite(rate)
      ? rate
      : process.env.NODE_ENV === "production"
        ? 0.1
        : 1,
    environment: process.env.NODE_ENV,
  });
}
