/**
 * Pure retry / degradation policy (Story 1.4, NFR-L1/R1). NO IO —
 * node-testable. The adapter executes the plan; pg-boss adds job-level
 * jittered backoff on top (NFR-L1).
 */

/** HTTP statuses worth retrying (transient). 4xx (400/401/403/404/413)
 *  are NOT retried — they won't succeed on retry. */
export const RETRYABLE_STATUSES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504, 529,
]);

export function isRetryableStatus(status: number | undefined): boolean {
  return status !== undefined && RETRYABLE_STATUSES.has(status);
}

export const MAX_RETRIES_PER_MODEL = 3;

/** Full-jitter exponential backoff: random in [0, min(cap, base·2^n)].
 *  `rng` injected for deterministic tests. */
export function backoffWithJitterMs(
  attempt: number,
  opts?: { baseMs?: number; capMs?: number; rng?: () => number },
): number {
  const base = opts?.baseMs ?? 500;
  const cap = opts?.capMs ?? 15_000;
  const rng = opts?.rng ?? Math.random;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  return Math.floor(rng() * exp);
}

export interface PlanStep {
  model: string;
  /** 1..retriesPerModel within this model before degrading. */
  attempt: number;
}

/**
 * Build the ordered attempt plan: each model gets `retriesPerModel`
 * tries before degrading to the next. e.g. sonnet×3 → haiku×3. After
 * the plan is exhausted the adapter falls to cache → static → friendly.
 */
export function buildAttemptPlan(
  models: readonly string[],
  retriesPerModel: number = MAX_RETRIES_PER_MODEL,
): PlanStep[] {
  const plan: PlanStep[] = [];
  for (const model of models) {
    for (let attempt = 1; attempt <= retriesPerModel; attempt++) {
      plan.push({ model, attempt });
    }
  }
  return plan;
}
