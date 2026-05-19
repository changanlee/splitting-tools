import { afterEach, describe, expect, it, vi } from "vitest";

import { checkParseBudget } from "@/features/parsing/server/budget";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkParseBudget — Story 1.7 seam (replaces 1.3 default-pass)", () => {
  // The real per-session/per-IP enforcement is exercised against a
  // live `rate_counters` table — that path is W-defer (integration,
  // not node-tested per the established strategy). The pure decision
  // maths lives in `src/lib/rateLimit.test.ts`. What this test
  // asserts is AC6 fail-OPEN behavior on a DB outage: in the test
  // env there is no DATABASE_URL, so the underlying upsert throws,
  // the seam catches and fails OPEN → the payer is never deadlocked
  // (v1 NFR-R2 / NFR-P1; W-1-7-1 in deferred-work).
  //
  // Review P4: also assert `console.error` was called — without this
  // spy a future regression that silently returns `ok:true` (or a
  // CI env where DATABASE_URL leaks in, making the upsert succeed
  // at count=1 < limit) would pass for the WRONG reason. The seam
  // contract is "logged, never silent" — this verifies it.
  it("DB outage → fail-OPEN with non-silent console.error (W-1-7-1)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const decision = await checkParseBudget({
      sessionId: "s1",
      ipKey: "ip:abc",
      pages: 1,
    });
    expect(decision).toEqual({ ok: true });
    expect(errSpy).toHaveBeenCalled();
    // First arg should be the seam's documented fail-OPEN log prefix —
    // catching a silent-swallow regression even if other code paths
    // also call console.error.
    const calls = errSpy.mock.calls;
    expect(
      calls.some((args) =>
        typeof args[0] === "string" &&
        args[0].includes("[checkParseBudget] DB blip"),
      ),
    ).toBe(true);
  });
});
