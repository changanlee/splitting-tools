import { describe, expect, it } from "vitest";

import {
  settle,
  settlementSum,
  type SettleClaim,
  type SettleLine,
} from "@/lib/money/settle";

/**
 * Σ original gross over ALL lines (including IRC) — the conservation
 * baseline parsed_sum that 1.5 AC6 defines.
 */
function grossSum(lines: SettleLine[]): number {
  return lines.reduce(
    (a, l) => a + (l.isIrc && !l.orphan ? 0 : l.netCents),
    0,
  );
}

describe("settle — conservation invariant (FR50 CI gate)", () => {
  it("Σ byIdentity + pending + orphan == Σ net (claimable + orphan IRC)", () => {
    const lines: SettleLine[] = [
      {
        id: "L1",
        netCents: 4490 - 900, // parent w/ folded IRC
        isIrc: false,
        claimable: true,
        orphan: false,
      },
      { id: "L2", netCents: 9990, isIrc: false, claimable: true, orphan: false },
      // Folded (non-orphan) IRC — already in L1's net; settlement skips it
      {
        id: "L3",
        netCents: -900,
        isIrc: true,
        claimable: false,
        orphan: false,
      },
    ];
    const claims: SettleClaim[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "B", weight: 1 },
    ];
    const r = settle(lines, claims);
    expect(settlementSum(r)).toBe(grossSum(lines));
  });

  it("unclaimed lines flow to pendingCents (not lost)", () => {
    const lines: SettleLine[] = [
      { id: "L1", netCents: 1000, isIrc: false, claimable: true, orphan: false },
      { id: "L2", netCents: 500, isIrc: false, claimable: true, orphan: false },
    ];
    const claims: SettleClaim[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = settle(lines, claims);
    expect(r.byIdentity.get("A")).toBe(1000);
    expect(r.pendingCents).toBe(500);
    expect(settlementSum(r)).toBe(1500);
  });

  it("orphan IRC flows to orphanIrcCents (kept, negative)", () => {
    const lines: SettleLine[] = [
      { id: "L1", netCents: 1000, isIrc: false, claimable: true, orphan: false },
      { id: "I1", netCents: -200, isIrc: true, claimable: false, orphan: true },
    ];
    const claims: SettleClaim[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = settle(lines, claims);
    expect(r.orphanIrcCents).toBe(-200);
    expect(r.byIdentity.get("A")).toBe(1000);
    expect(settlementSum(r)).toBe(800);
  });

  it("empty receipt / no claims → zero everything (defensive)", () => {
    const r = settle([], []);
    expect(r.byIdentity.size).toBe(0);
    expect(r.pendingCents).toBe(0);
    expect(r.orphanIrcCents).toBe(0);
    expect(settlementSum(r)).toBe(0);
  });

  it("deterministic — same inputs produce same outputs across calls", () => {
    const lines: SettleLine[] = [
      { id: "L1", netCents: 1000, isIrc: false, claimable: true, orphan: false },
    ];
    const claims: SettleClaim[] = [
      { receiptLineId: "L1", identityId: "X", weight: 1 },
      { receiptLineId: "L1", identityId: "Y", weight: 1 },
    ];
    const a = settle(lines, claims);
    const b = settle(lines, claims);
    expect(Array.from(a.byIdentity.entries())).toEqual(
      Array.from(b.byIdentity.entries()),
    );
    expect(a.pendingCents).toBe(b.pendingCents);
    expect(a.orphanIrcCents).toBe(b.orphanIrcCents);
  });
});

describe("settle — #5564 placeholder scale (FR50 anchor)", () => {
  it("placeholder 28-line synthetic #5564 nets to 220850 (matches 1.5 algorithm contract)", () => {
    // 25 parent lines @ 9234, 3 IRC folded into 3 of them: gross sum
    // 230850 - 10000 = 220850. After IRC fold in 1.5 the parent
    // net_cents already absorbs the IRC, so we pass the post-fold
    // nets here (matches what receipt_lines persists).
    const parents: SettleLine[] = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`,
      netCents:
        i === 0
          ? 9234 - 4000
          : i === 1
            ? 9234 - 3500
            : i === 2
              ? 9234 - 2500
              : 9234,
      isIrc: false,
      claimable: true,
      orphan: false,
    }));
    const ircRows: SettleLine[] = [
      { id: "i0", netCents: -4000, isIrc: true, claimable: false, orphan: false },
      { id: "i1", netCents: -3500, isIrc: true, claimable: false, orphan: false },
      { id: "i2", netCents: -2500, isIrc: true, claimable: false, orphan: false },
    ];
    const lines = [...parents, ...ircRows];
    // No claimers → everything pending; settlement_sum == 220850.
    const r = settle(lines, []);
    expect(r.pendingCents).toBe(220850);
    expect(settlementSum(r)).toBe(220850);
  });
});
