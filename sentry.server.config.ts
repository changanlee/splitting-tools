import * as Sentry from "@sentry/nextjs";

// Graceful degradation: no DSN -> no init -> app runs normally, no crash
// (AC7 / Side Project standards: never leak ops config as a hard failure).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    environment: process.env.NODE_ENV,
  });
}
