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
  | "awaiting_printed_total"
  | "unverified";

export interface ReconciliationResult {
  state: ReconciliationState;
  /**
   * Signed `parsedSumCents - printedTotalCents`:
   * - `verified` → 0
   * - `mismatch` → ≠ 0 (positive = parsed above printed; negative = below)
   * - `awaiting_printed_total` → null
   * - `unverified` → whatever the underlying mismatch is (preserved so
   *   the bar can still show "差 NT$X" alongside the unverified flag)
   */
  mismatchCents: number | null;
}

export function computeReconciliation(
  parsedSumCents: number,
  printedTotalCents: number | null,
  /**
   * Story 2.6 — when the payer has chosen the "未驗證強制放行" escape
   * hatch (sessions.unverified=true), the bar must surface that
   * decision regardless of the underlying maths so claimants and
   * the payer themselves see they bypassed verification (FR14/FR15).
   */
  unverified: boolean = false,
): ReconciliationResult {
  if (unverified) {
    if (printedTotalCents === null) {
      return { state: "unverified", mismatchCents: null };
    }
    return {
      state: "unverified",
      mismatchCents: parsedSumCents - printedTotalCents,
    };
  }
  if (printedTotalCents === null) {
    return { state: "awaiting_printed_total", mismatchCents: null };
  }
  const delta = parsedSumCents - printedTotalCents;
  if (delta === 0) {
    return { state: "verified", mismatchCents: 0 };
  }
  return { state: "mismatch", mismatchCents: delta };
}
