/**
 * Parse-endpoint budget — Story 1.7 wires this previously-default-pass
 * seam (Story 1.3 AC6) to the real per-session AND per-IP page counters
 * in `rate_counters` (FR46 / NFR-S7 / NFR-L5). Single Postgres, no
 * Redis (architecture L244-247).
 *
 * Routes call this exactly once per submit; it runs the two key checks
 * in parallel. The PURE decision maths and tunable defaults live in
 * `src/lib/rateLimit.ts`; the atomic DB upsert lives in
 * `src/lib/rateLimit.server.ts`.
 *
 * fail-OPEN on DB blip — explicit v1 tradeoff (NFR-R2 / NFR-P1 — a
 * normal payer must not be blocked by a momentary counter outage;
 * grief shield is secondary). Tracked as W-1-7-1 in deferred-work.
 *
 * Story 1.3 → 1.7 contract change: the seam was `(sessionId): sync`
 * (default pass). Now `(args): Promise<...>` with `ipKey`/`pages`. The
 * route is updated in lockstep; the seam path stays.
 */
import {
  PER_IP_DAILY_PAGES,
  PER_SESSION_DAILY_PAGES,
  RATE_WINDOW_MS,
} from "@/lib/rateLimit";
import { checkAndIncrementRate } from "@/lib/rateLimit.server";

export type BudgetDecision =
  | { ok: true }
  | { ok: false; message: string; retryAfterSeconds: number };

const FRIENDLY_RATE_LIMITED = "請求次數過多，請稍後再試。";

export async function checkParseBudget(args: {
  sessionId: string;
  /** Pre-hashed IP key (e.g. `ip:<sha256>`), produced by `sha256IpKey`. */
  ipKey: string;
  pages: number;
}): Promise<BudgetDecision> {
  const sessionKey = `session:${args.sessionId}`;

  try {
    // Both checks atomically count this submission against their key.
    // Either deny → reject; success → both keys are incremented.
    const [sess, ip] = await Promise.all([
      checkAndIncrementRate(
        sessionKey,
        args.pages,
        PER_SESSION_DAILY_PAGES,
        RATE_WINDOW_MS,
      ),
      checkAndIncrementRate(
        args.ipKey,
        args.pages,
        PER_IP_DAILY_PAGES,
        RATE_WINDOW_MS,
      ),
    ]);

    if (!sess.allow || !ip.allow) {
      // Pick the larger retryAfter so the client doesn't immediately
      // bounce off the OTHER cap on the next try.
      const retryAfterMs = Math.max(sess.retryAfterMs, ip.retryAfterMs);
      return {
        ok: false,
        message: FRIENDLY_RATE_LIMITED,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }
    return { ok: true };
  } catch (e) {
    // fail-OPEN (AC6 / W-1-7-1): a counter outage must not deadlock
    // legitimate payers. Logged, never silent.
    console.error(
      "[checkParseBudget] DB blip — failing OPEN (v1 tradeoff):",
      e instanceof Error ? e.message : String(e),
    );
    return { ok: true };
  }
}
