/**
 * PLACEHOLDER fixture for Costco receipt #5564 (Story 1.1 scaffold).
 *
 * 🚫 NOT the real receipt. Story 1.4/1.5 replace this with the real image
 * + LLM-parsed line items; Story 5.1 wires the deterministic settlement.
 * The numbers below are the regression CONTRACT only, not parsed data.
 *
 * Money is integer cents, never float (architecture / Side Project
 * non-negotiable). NT$2208.50 == 220850 cents.
 */
export const RECEIPT_5564 = {
  isPlaceholder: true as const,
  /** Canonical regression anchor: parsed_sum for #5564 in integer cents. */
  expectedParsedSumCents: 220_850,
  /** Major-unit form, kept only to document the encoding (2208.50). */
  expectedParsedSumMajor: 2208.5,
} as const;

/**
 * Placeholder settlement: for the scaffold harness, the settled total is
 * defined to equal parsed_sum (trivial identity). Story 5.1 replaces this
 * with the real deterministic settlement (largest-remainder + stable sort,
 * FR50) — the invariant id stays the same.
 */
export function placeholderSettlementSumCents(): number {
  return RECEIPT_5564.expectedParsedSumCents;
}
