import { describe, expect, it } from "vitest";

import { checkParseBudget } from "@/features/parsing/server/budget";

describe("checkParseBudget — Story 1.7 seam (replaces 1.3 default-pass)", () => {
  // The real per-session/per-IP enforcement is exercised against a
  // live `rate_counters` table — that path is W-defer (integration,
  // not node-tested per the established strategy). The pure decision
  // maths lives in `src/lib/rateLimit.test.ts` (covered there). What
  // this test asserts here is the AC6 fail-OPEN behavior on a DB
  // outage: in the test env there is NO DATABASE_URL, so the
  // underlying `checkAndIncrementRate` upsert throws, the catch in
  // budget.ts logs and fails OPEN → the payer is not deadlocked
  // (v1 NFR-R2 / NFR-P1 tradeoff; tracked as W-1-7-1).
  it("DB outage → fail-OPEN (returns ok:true, v1 W-1-7-1 tradeoff)", async () => {
    const decision = await checkParseBudget({
      sessionId: "s1",
      ipKey: "ip:abc",
      pages: 1,
    });
    expect(decision).toEqual({ ok: true });
  });
});
