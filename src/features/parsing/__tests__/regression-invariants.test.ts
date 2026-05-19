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

  // Story 1.4 wired the visionAdapter LLM-Ops boundary + parseWorker,
  // but the REAL #5564 fixture + parse-accuracy assertion need verified
  // ground truth AND a live Claude run (no ANTHROPIC_API_KEY here) —
  // honestly deferred to deferred-work W-1-4-1 (real runtime) and
  // W-CR-5 (multi-page n=0). NOT fabricated (would be a tautology;
  // W-CR-4). The 1.5 IRC net (== 2208.50) lands with Story 1.5.
  it.todo(
    "parsed_sum == 2208.50 against the REAL #5564 fixture — Story 1.4/1.5 (gated on W-1-4-1)",
  );
  it.todo(
    "settlement_sum == parsed_sum via src/lib/money/settle.ts — fill in Story 5.1 (FR50)",
  );
});
