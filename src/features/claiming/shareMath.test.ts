import { describe, expect, it } from "vitest";

import {
  computeSubtotals,
  sumSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";

describe("computeSubtotals — largest-remainder integer-cents", () => {
  it("single claimer takes the whole net", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    expect(s.get("A")).toBe(9990);
    expect(sumSubtotals(s)).toBe(9990);
  });

  it("two even claimers split equally; remainder distributed by stable id order", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9990 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "B", weight: 1 },
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    // 9990 / 2 = 4995 each, exact.
    expect(s.get("A")).toBe(4995);
    expect(s.get("B")).toBe(4995);
    expect(sumSubtotals(s)).toBe(9990);
  });

  it("odd cent leftover routes to the lexicographically-first id (deterministic)", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 9991 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "B", weight: 1 },
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    expect(sumSubtotals(s)).toBe(9991);
    // Both share equally with remainder 1 each — tie broken by id.
    expect(s.get("A")).toBeGreaterThanOrEqual(s.get("B") ?? 0);
  });

  it("weighted 2:1 → exact-on-base case", () => {
    const lines: LineForShare[] = [{ id: "L1", netCents: 3000 }];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 2 },
      { receiptLineId: "L1", identityId: "B", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    expect(s.get("A")).toBe(2000);
    expect(s.get("B")).toBe(1000);
    expect(sumSubtotals(s)).toBe(3000);
  });

  it("unclaimed line contributes nothing to anyone", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000 },
      { id: "L2", netCents: 500 },
    ];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    expect(s.get("A")).toBe(1000);
    expect(s.get("B")).toBeUndefined();
    expect(sumSubtotals(s)).toBe(1000); // L2 NOT in any subtotal (pending)
  });

  it("multiple lines accumulate per identity; conservation across all claimed lines", () => {
    const lines: LineForShare[] = [
      { id: "L1", netCents: 1000 },
      { id: "L2", netCents: 2000 },
      { id: "L3", netCents: 3000 },
    ];
    const claims: ClaimForShare[] = [
      { receiptLineId: "L1", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "A", weight: 1 },
      { receiptLineId: "L2", identityId: "B", weight: 1 },
      { receiptLineId: "L3", identityId: "B", weight: 1 },
    ];
    const s = computeSubtotals(lines, claims);
    expect(s.get("A")).toBe(1000 + 1000);
    expect(s.get("B")).toBe(1000 + 3000);
    expect(sumSubtotals(s)).toBe(1000 + 2000 + 3000);
  });
});
