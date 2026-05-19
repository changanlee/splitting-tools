/**
 * Parse-budget SEAM — Story 1.3 (AC6), pure & default-pass.
 *
 * 🚫 Do NOT implement enforcement here. Story 1.7 (FR46 / NFR-S7 /
 * NFR-L5) replaces the body with real per-session / per-IP token-bucket
 * enforcement against the `rate_counters` table (1.1 schema). Keeping
 * this a pure default-pass seam means 1.3 stays non-blocking and 1.7
 * drops in WITHOUT touching the route call sites.
 */
export type BudgetDecision = { ok: true } | { ok: false; message: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- seam param consumed by Story 1.7 (rate_counters)
export function checkParseBudget(sessionId: string): BudgetDecision {
  // Story 1.7 seam — intentionally always passes at 1.3.
  return { ok: true };
}
