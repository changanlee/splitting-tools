import { describe, expect, it } from "vitest";

import { computeReconciliation } from "@/features/reconciliation/compute";

describe("computeReconciliation — three states (AC1)", () => {
  it("printedTotalCents null → awaiting_printed_total, mismatchCents null", () => {
    expect(computeReconciliation(220850, null)).toEqual({
      state: "awaiting_printed_total",
      mismatchCents: null,
    });
    // Also when no lines parsed yet (parsed=0)
    expect(computeReconciliation(0, null)).toEqual({
      state: "awaiting_printed_total",
      mismatchCents: null,
    });
  });

  it("exact equality → verified, mismatchCents 0", () => {
    expect(computeReconciliation(220850, 220850)).toEqual({
      state: "verified",
      mismatchCents: 0,
    });
    // Edge: both zero (valid empty receipt with zero printed total)
    expect(computeReconciliation(0, 0)).toEqual({
      state: "verified",
      mismatchCents: 0,
    });
  });

  it("parsed above printed → mismatch, positive signed delta", () => {
    expect(computeReconciliation(220850, 220000)).toEqual({
      state: "mismatch",
      mismatchCents: 850,
    });
  });

  it("parsed below printed → mismatch, negative signed delta", () => {
    expect(computeReconciliation(219000, 220850)).toEqual({
      state: "mismatch",
      mismatchCents: -1850,
    });
  });

  it("integer-cents only — no float, signed delta is always integer", () => {
    const r = computeReconciliation(123_456, 100_000);
    expect(Number.isInteger(r.mismatchCents!)).toBe(true);
    expect(r.mismatchCents).toBe(23_456);
  });

  it("large values within 2^31 are handled", () => {
    // Far above any realistic receipt but proves no overflow / float drift
    const big = 2_000_000_000;
    expect(computeReconciliation(big, big - 1)).toEqual({
      state: "mismatch",
      mismatchCents: 1,
    });
  });
});
