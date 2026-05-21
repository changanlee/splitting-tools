/**
 * Cross-epic regression invariants harness (AC6).
 *
 * These two invariants are the deployment gate for Epic 1 (Story 1.4/1.5)
 * and Epic 5 (Story 5.1). Story 1.1 ships the harness wired into CI and
 * EXECUTING against the placeholder anchor (pipeline is real & green).
 * Later stories swap the placeholder for the real #5564 fixture / the
 * deterministic settlement fn — WITHOUT rebuilding this pipeline. The
 * `it.todo` markers below are carry-forward anchors; do not rename them.
 */
import { describe, expect, it } from "vitest";

import {
  RECEIPT_5564,
  placeholderSettlementSumCents,
} from "@/features/parsing/__fixtures__/receipt-5564.placeholder";

const EXPECTED_PARSED_SUM_CENTS = 220_850; // NT$2208.50

describe("regression invariants (#5564)", () => {
  // --- Executing placeholder assertions: prove the CI pipeline truly
  //     runs assertions and is green today. ---

  it("parsed_sum == 2208.50 (placeholder anchor, integer cents)", () => {
    expect(RECEIPT_5564.expectedParsedSumCents).toBe(EXPECTED_PARSED_SUM_CENTS);
    // Encoding sanity: 2208.50 major == 220850 cents, no float drift.
    expect(Math.round(RECEIPT_5564.expectedParsedSumMajor * 100)).toBe(
      EXPECTED_PARSED_SUM_CENTS,
    );
  });

  it("settlement_sum == parsed_sum (placeholder identity)", () => {
    expect(placeholderSettlementSumCents()).toBe(
      RECEIPT_5564.expectedParsedSumCents,
    );
  });

  // --- Carry-forward contract markers: the LIVE assertions land in the
  //     stories named below (real fixture / real settle fn). ---

  // Story 1.4 wired the visionAdapter LLM-Ops boundary; Story 1.5
  // implemented the pure IRC attribution + parsed_sum maths and proves
  // it (incl. a clearly-labelled SYNTHETIC #5564-structure case →
  // 220850) in `src/features/parsing/irc.test.ts`. The REAL #5564
  // end-to-end assertion still needs verified OCR ground truth + a
  // live LLM run (no OPENROUTER_API_KEY here) → honestly stays
  // gated: deferred-work W-1-4-1 (real runtime) + W-CR-5 (multi-page
  // n=0). NOT fabricated (W-CR-4). Anchor preserved, not faked green.
  it.todo(
    "parsed_sum == 2208.50 against the REAL #5564 fixture — gated W-1-4-1 (algorithm: irc.test.ts)",
  );
  // Story 5.1 — settle.ts deterministic settlement function landed.
  // Conservation contract Σ byIdentity + pending + orphanIrc ==
  // parsed_sum is asserted in settle.test.ts across multiple shapes;
  // here we re-assert it at the cross-epic boundary against the
  // placeholder anchor (220850), proving the math gate from the
  // CI deployment perspective. Real-fixture #5564 still anchored at
  // it.todo above (gated W-1-4-1).
  it("settlement_sum == parsed_sum on the #5564 placeholder (FR50 / Story 5.1)", async () => {
    const { settle, settlementSum } = await import("@/lib/money/settle");
    const { RECEIPT_5564 } = await import(
      "@/features/parsing/__fixtures__/receipt-5564.placeholder"
    );
    const lines = [
      {
        id: "placeholder-line",
        netCents: RECEIPT_5564.expectedParsedSumCents,
        qty: 1,
        isIrc: false,
        claimable: true,
        orphan: false,
      },
    ];
    // No claimers → everything pending; conservation must hold.
    const r = settle(lines, []);
    expect(settlementSum(r)).toBe(RECEIPT_5564.expectedParsedSumCents);
  });
});
