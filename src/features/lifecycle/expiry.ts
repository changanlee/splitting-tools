/**
 * Story 6.1 — pure expiry math (NFR-S4 30-day verifiable destroy).
 *
 * `EXPIRY_DAYS` is exported so tests can pin against it and CI gates
 * the cleanup interval explicitly.
 */

export const EXPIRY_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Compute the expiry timestamp for a session created at `createdAt`. */
export function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + EXPIRY_DAYS * MS_PER_DAY);
}

/** True iff `now` is at or past the expiry instant for the session. */
export function isExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= expiresAt(createdAt).getTime();
}
