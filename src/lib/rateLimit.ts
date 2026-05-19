/**
 * Parse-endpoint budget — Story 1.7 (FR46 / NFR-S7 / NFR-L5). PURE
 * decision logic, NO IO — node-testable. The DB upsert glue lives in
 * `rateLimit.server.ts`; the route handler stitches them.
 *
 * Counted by PAGE COUNT (not per-request), aligning with the LLM cost
 * driver (CIP fold-in). Single-Postgres design — `rate_counters` is
 * already in the Story 1.1 0000 migration; no schema change here.
 * Fixed 24h rolling window per key. Defaults chosen so a normal payer
 * is nowhere near the cap (~1-3 pages/day in real use); they are
 * exported so deployment can tune from real traffic (W-1-7-2).
 */

/** Per-session-day page cap. 5 pages/parse × 8 parses = 40; normal use << 40. */
export const PER_SESSION_DAILY_PAGES = 40;

/** Per-IP-day page cap. Tolerates NAT (~5 sessions × 40 = 200). */
export const PER_IP_DAILY_PAGES = 200;

/** Rolling window length: 24h. */
export const RATE_WINDOW_MS = 86_400_000;

export interface RateCounterState {
  /** ISO timestamp of the current window start. */
  windowStart: Date;
  /** Pages already counted in this window. */
  count: number;
}

export interface RateDecision {
  allow: boolean;
  /** Counter state to PERSIST after this decision (window-reset already applied). */
  newCount: number;
  newWindowStart: Date;
  /** Only set when allow=false; ms until the window resets. */
  retryAfterMs?: number;
}

/**
 * Pure decision: would adding `pages` to this counter cross `limit` in
 * its current window? Returns the post-decision state to persist
 * regardless of allow/deny — including the deny case, where the burst
 * is still counted (fail-conservative: a denied burst won't refresh
 * the cap until the window naturally rolls).
 *
 * Reset rules: `current == null` (no prior counter) OR `now - windowStart >= windowMs`
 * → start a fresh window at `now` with `pages` as the new count.
 * Otherwise inherit the window and add `pages`.
 */
export function decideRateLimit(
  current: RateCounterState | null,
  now: Date,
  pages: number,
  limit: number,
  windowMs: number,
): RateDecision {
  // Guard non-positive / non-finite pages — treat as zero-cost no-op
  // (a malformed page count should NOT be a free unlimited pass; the
  // endpoint validates 1..MAX_PARSE_PAGES upstream, so this is purely
  // defensive against contract violations).
  const p = Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0;

  const expired =
    current === null || now.getTime() - current.windowStart.getTime() >= windowMs;

  const newWindowStart = expired ? now : current!.windowStart;
  const baseCount = expired ? 0 : current!.count;
  const newCount = baseCount + p;

  if (newCount > limit) {
    const elapsed = now.getTime() - newWindowStart.getTime();
    // Bounded by [0, windowMs]: a backward clock skew (`elapsed < 0`)
    // would otherwise inflate the wait past a full window; a runaway
    // `elapsed > windowMs` (caller passed an inconsistent state) would
    // produce a negative wait. Both are defensive — review P1.
    const retryAfterMs = Math.min(
      windowMs,
      Math.max(0, windowMs - elapsed),
    );
    return { allow: false, newCount, newWindowStart, retryAfterMs };
  }
  return { allow: true, newCount, newWindowStart };
}
