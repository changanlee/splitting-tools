/**
 * Suspicious-line heuristic — Story 2.2 (FR9). PURE, NO IO.
 *
 * Three signals, each independently testable:
 *
 * 1. `share_ratio_outlier` — a single product line whose net share
 *    of the receipt exceeds 50% (and the receipt has ≥3 product
 *    lines; tiny receipts are by-design lopsided so the heuristic
 *    only fires when there's enough context to make "outlier"
 *    meaningful).
 * 2. `description_unusual` — description has no CJK ideograph AND
 *    no Latin letter (pure symbols / digits / punctuation). OCR
 *    failures on a product name produce these; payer should glance.
 * 3. `negative_non_irc` — `amountCents < 0` on a line marked
 *    `isIrc=false`. Invariant break upstream; flag for review.
 *
 * Returns a stable, ordered list of flag codes so the UI can render
 * a deterministic explanation; `severity` is the boolean roll-up the
 * row visual uses.
 */
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";

export type SuspiciousFlag =
  | "share_ratio_outlier"
  | "description_unusual"
  | "negative_non_irc";

export interface SuspiciousResult {
  flags: SuspiciousFlag[];
  severity: "normal" | "suspicious";
}

const HAS_CJK = /[一-鿿㐀-䶿]/;
const HAS_LATIN_LETTER = /[A-Za-z]/;

export interface SuspiciousContext {
  /** Σ netCents over claimable product lines (not IRC children). */
  totalClaimableNetCents: number;
  /** Count of claimable product lines (drives the ratio's eligibility). */
  productLineCount: number;
}

export function buildSuspiciousContext(
  lines: ReceiptLineView[],
): SuspiciousContext {
  let total = 0;
  let count = 0;
  for (const l of lines) {
    if (l.claimable && !l.isIrc) {
      total += l.netCents;
      count += 1;
    }
  }
  return { totalClaimableNetCents: total, productLineCount: count };
}

export function classifySuspicious(
  line: ReceiptLineView,
  ctx: SuspiciousContext,
): SuspiciousResult {
  const flags: SuspiciousFlag[] = [];

  // 1. share ratio outlier — only meaningful on claimable product
  // rows in a receipt with ≥3 of them.
  if (
    line.claimable &&
    !line.isIrc &&
    ctx.productLineCount >= 3 &&
    ctx.totalClaimableNetCents > 0 &&
    line.netCents / ctx.totalClaimableNetCents > 0.5
  ) {
    flags.push("share_ratio_outlier");
  }

  // 2. unusual description — only meaningful for product rows
  // (IRC discount lines legitimately carry short symbols like "IRC").
  if (!line.isIrc && line.description.length > 0) {
    if (!HAS_CJK.test(line.description) && !HAS_LATIN_LETTER.test(line.description)) {
      flags.push("description_unusual");
    }
  }

  // 3. invariant break: negative amount on a non-IRC line.
  if (!line.isIrc && line.grossCents < 0) {
    flags.push("negative_non_irc");
  }

  return {
    flags,
    severity: flags.length > 0 ? "suspicious" : "normal",
  };
}
