import { describe, expect, it } from "vitest";

import { canProgress } from "@/features/reconciliation/canProgress";
import type { ReconciliationState } from "@/features/reconciliation/compute";

const ALL_STATES: ReconciliationState[] = [
  "verified",
  "mismatch",
  "awaiting_printed_total",
  "unverified",
];

describe("canProgress — never-deadlock invariant (FR16 / NFR-R2)", () => {
  it("verified / unverified can progress directly", () => {
    expect(canProgress("verified").canProgress).toBe(true);
    expect(canProgress("unverified").canProgress).toBe(true);
  });

  it("mismatch / awaiting cannot progress YET but list escape hatches", () => {
    expect(canProgress("mismatch").canProgress).toBe(false);
    expect(canProgress("awaiting_printed_total").canProgress).toBe(false);
  });

  it("EVERY state has at least one nextHint (no dead end)", () => {
    for (const s of ALL_STATES) {
      const d = canProgress(s);
      expect(d.nextHints.length).toBeGreaterThanOrEqual(1);
      // No hint string is empty
      for (const h of d.nextHints) {
        expect(h.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("the four states are exhaustive — adding a new state without updating canProgress would TypeScript-fail", () => {
    // Spec-of-spec: this test exists so a future reconciliation
    // state added to compute.ts without a corresponding canProgress
    // case breaks the build. The `_exhaustive: never` line in the
    // default branch handles that contract; this test just asserts
    // we tried each known state above.
    expect(new Set(ALL_STATES).size).toBe(4);
  });
});
