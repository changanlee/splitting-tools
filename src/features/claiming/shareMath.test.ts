import { describe, expect, it } from "vitest";

import {
  computeSubtotals,
  sumSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";

describe("computeSubtotals — largest-remainder integer-cents", () => {
  it("single claimer takes the whole net (qty=1)", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
    expect(sumSubtotals(r.byIdentity)).toBe(9990);
  });

  it("two even claimers split equally; remainder distributed by stable id order", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "B", weight: 1 },
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.byIdentity.get("B")).toBe(4995);
    expect(sumSubtotals(r.byIdentity)).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("odd cent leftover routes to the lexicographically-first id (deterministic)", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9991, qty: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "B", weight: 1 },
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(sumSubtotals(r.byIdentity)).toBe(9991);
    expect(r.byIdentity.get("A") ?? 0).toBeGreaterThanOrEqual(
      r.byIdentity.get("B") ?? 0,
    );
  });

  it("weighted 2:1 → exact-on-base case (qty=1, Σw=3, denom=3)", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 3000, qty: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
      { receiptLineId: "L1", identityId: "B", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(2000);
    expect(r.byIdentity.get("B")).toBe(1000);
    expect(sumSubtotals(r.byIdentity)).toBe(3000);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("unclaimed line contributes nothing to anyone", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000, qty: 1 },
      { id: "L2", netCents: 500, qty: 1 },
    ];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(1000);
    expect(r.byIdentity.get("B")).toBeUndefined();
    expect(sumSubtotals(r.byIdentity)).toBe(1000);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("multiple lines accumulate per identity; conservation across all claimed lines", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000, qty: 1 },
      { id: "L2", netCents: 2000, qty: 1 },
      { id: "L3", netCents: 3000, qty: 1 },
    ];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "B", weight: 1 },
      { receiptLineId: "L3", identityId: "B", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(1000 + 1000);
    expect(r.byIdentity.get("B")).toBe(1000 + 3000);
    expect(sumSubtotals(r.byIdentity)).toBe(1000 + 2000 + 3000);
    expect(r.pendingFromUnderclaim).toBe(0);
  });
});

describe("computeSubtotals — qty > Σweights spills the remainder to pending", () => {
  it("4-pack ¥99.90, single claimer weight=2 → claimer ¥49.95, pending ¥49.95", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(4995);
    expect(sumSubtotals(r.byIdentity) + r.pendingFromUnderclaim).toBe(9990);
  });

  it("4-pack ¥99.90, two claimers each weight=1 → each ¥24.98/¥24.97, pending ¥49.95", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
      { receiptLineId: "L1", identityId: "B", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    const a = r.byIdentity.get("A") ?? 0;
    const b = r.byIdentity.get("B") ?? 0;
    expect(a + b).toBe(4995); // claimer pool = floor(9990*2/4) = 4995
    expect(r.pendingFromUnderclaim).toBe(4995);
    // Lexicographic tiebreak: A gets the extra cent.
    expect(a).toBe(2498);
    expect(b).toBe(2497);
    expect(sumSubtotals(r.byIdentity) + r.pendingFromUnderclaim).toBe(9990);
  });

  it("4-pack ¥99.90, claimer weight=4 → claimer ¥99.90, pending 0", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 4 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("over-claim Σw > qty collapses to relative-share (denom = Σw)", () => {
    // 4-pack but two claimers each take weight=3 — they want it split
    // 50/50 (they think they each took half). Σw=6 > qty=4 → denom=6.
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 3 },
      { receiptLineId: "L1", identityId: "B", weight: 3 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.byIdentity.get("B")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("qty=1 unedited bundle stays backward-compatible (no spillover)", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, qty: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
    ];
    const r = computeSubtotals(lines, claims);
    // denom = max(1, 2) = 2; claimerPool = 9990*2/2 = 9990 (full).
    expect(r.byIdentity.get("A")).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
  });
});
