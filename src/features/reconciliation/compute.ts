/**
 * Reconciliation decision — Story 2.1 (FR8). PURE, NO IO — node-testable.
 * Three states because v1 ships BEFORE Story 2.5 (manual printed-total
 * input), so `sessions.printed_total_cents` starts NULL; a two-state
 * verified/mismatch UI would paint every freshly-parsed receipt red
 * and torch trust UX. `awaiting_printed_total` is the honest "no
 * baseline to compare against yet" signal (amber).
 *
 * Integer cents only — money guardrail; signed `mismatchCents` so the
 * UI can show direction (parsed-high vs parsed-low) while displaying
 * its absolute value.
 */

export type ReconciliationState =
  | "verified"
  | "mismatch"
  | "awaiting_printed_total";

export interface ReconciliationResult {
  state: ReconciliationState;
  /**
   * Signed `parsedSumCents - printedTotalCents`:
   * - `verified` → 0
   * - `mismatch` → ≠ 0 (positive = parsed above printed; negative = below)
   * - `awaiting_printed_total` → null
   */
  mismatchCents: number | null;
}

export function computeReconciliation(
  parsedSumCents: number,
  printedTotalCents: number | null,
): ReconciliationResult {
  if (printedTotalCents === null) {
    return { state: "awaiting_printed_total", mismatchCents: null };
  }
  const delta = parsedSumCents - printedTotalCents;
  if (delta === 0) {
    return { state: "verified", mismatchCents: 0 };
  }
  return { state: "mismatch", mismatchCents: delta };
}
