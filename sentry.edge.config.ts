import * as Sentry from "@sentry/nextjs";

// Edge runtime init. No DSN -> no-op (graceful skip, AC7).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    environment: process.env.NODE_ENV,
  });
}
