import { describe, expect, it } from "vitest";

import {
  computeSubtotals,
  sumSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";

describe("computeSubtotals — qty=1 single-share lines (relative split)", () => {
  it("single claimer takes the whole net", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
    expect(sumSubtotals(r.byIdentity)).toBe(9990);
  });

  it("two even claimers split equally; remainder by stable id order", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "B", weight: 1 },
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.byIdentity.get("B")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("odd cent leftover routes to the lexicographically-first id", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9991, shareCount: 1 }];
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

  it("weighted 2:1 ratio on a qty=1 line", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 3000, shareCount: 1 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
      { receiptLineId: "L1", identityId: "B", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(2000);
    expect(r.byIdentity.get("B")).toBe(1000);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("unclaimed line contributes nothing to anyone", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000, shareCount: 1 },
      { id: "L2", netCents: 500, shareCount: 1 },
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

  it("multiple lines accumulate per identity; conservation holds", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000, shareCount: 1 },
      { id: "L2", netCents: 2000, shareCount: 1 },
      { id: "L3", netCents: 3000, shareCount: 1 },
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
    expect(sumSubtotals(r.byIdentity)).toBe(6000);
  });
});

describe("computeSubtotals — multi-share lines (qty > 1)", () => {
  it("4-pack ¥99.90, single claimer takes 2 shares → ¥49.95, pending ¥49.95", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(4995);
    expect(sumSubtotals(r.byIdentity) + r.pendingFromUnderclaim).toBe(9990);
  });

  it("4-pack ¥99.90, claimer takes all 4 shares → ¥99.90, pending 0", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 4 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(9990);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("4-pack, A takes 2 + B takes 2 → ¥49.95 each, pending 0", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
      { receiptLineId: "L1", identityId: "B", weight: 2 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.byIdentity.get("B")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("4-pack, A takes 1 + B takes 1 → claimer pool ¥49.95, pending ¥49.95", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
      { receiptLineId: "L1", identityId: "B", weight: 1 },
    ];
    const r = computeSubtotals(lines, claims);
    expect((r.byIdentity.get("A") ?? 0) + (r.byIdentity.get("B") ?? 0)).toBe(
      4995,
    );
    expect(r.pendingFromUnderclaim).toBe(4995);
    expect(sumSubtotals(r.byIdentity) + r.pendingFromUnderclaim).toBe(9990);
  });

  it("over-claim (Σweights > qty) collapses to relative split, no pending", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990, shareCount: 4 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 3 },
      { receiptLineId: "L1", identityId: "B", weight: 3 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(4995);
    expect(r.byIdentity.get("B")).toBe(4995);
    expect(r.pendingFromUnderclaim).toBe(0);
  });

  it("2-pack ¥16.50, claimer takes both shares → full ¥16.50, no pending", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 1650, shareCount: 2 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
    ];
    const r = computeSubtotals(lines, claims);
    expect(r.byIdentity.get("A")).toBe(1650);
    expect(r.pendingFromUnderclaim).toBe(0);
  });
});
