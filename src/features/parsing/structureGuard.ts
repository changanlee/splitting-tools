/**
 * #5564 same-structure hard-lock — Story 1.6 (FR7, v1). PURE, NO IO —
 * fully node-testable. The parseWorker glue calls this; the rule lives
 * here.
 *
 * FR7 is a v1 HARD LOCK: only #5564-same-structure receipts are
 * accepted; anything else is explicitly rejected so the payer is never
 * SILENTLY mis-billed. The classifier is therefore **fail-closed** —
 * any disqualifying structural signal, OR the inability to positively
 * confirm a #5564 shape, returns `ok:false`. (A conservative false
 * reject is recoverable — the payer re-shoots / v1 scope widens later;
 * a false accept is an irreversible silent wrong split. So when in
 * doubt: reject.)
 *
 * Heuristics only — `ParsedReceipt` (1.4 contract) carries no currency
 * / tax / printed-total field, so structure is inferred from
 * description / rawText / amountCents. Real #5564 end-to-end accuracy
 * stays gated W-1-4-1 (no API key) / W-CR-5 (multi-page n=0); the tests
 * prove the CLASSIFIER, not OCR accuracy, on clearly-labelled synthetic
 * fixtures.
 */
import { PARENT_CODE_RE } from "@/features/parsing/irc";
import type { ParsedReceipt, ReceiptLine } from "@/features/parsing/schema";

export type StructureRejectReason =
  | "independent_tax_line"
  | "foreign_currency"
  | "no_recognizable_product_code"
  | "structural_inconsistency";

export type StructureClassification =
  | { ok: true }
  | { ok: false; reason: StructureRejectReason };

/**
 * Independent tax line — #5564 (Taiwan Costco) is tax-INCLUSIVE with no
 * standalone tax line item, so a separate tax line ⇒ non-#5564. Precise
 * multi-char CJK tax terms + latin TAX/VAT/GST. Bare single `稅`/`税` is
 * deliberately NOT matched (a real #5564 footer can carry that glyph —
 * false-rejecting the receipt we MUST accept is worse here; finer
 * precision against the real footer is gated W-1-4-1, not guessable
 * without a live parse).
 */
const TAX_RE =
  /(?:\b(?:TAX|VAT|GST)\b|消費[税稅]|營業稅|营业税|加值[税稅]|增值税|銷售稅|销售税|[税稅]額)/i;

/**
 * Explicit foreign-currency marker. NT$ / TWD and a bare `$` are NOT
 * foreign (#5564 prints NT$). Only unambiguous foreign codes/symbols.
 */
const FOREIGN_CURRENCY_RE =
  /(?:\bUSD\b|US\$|\bJPY\b|\bEUR\b|\bGBP\b|\bCNY\b|\bRMB\b|\bHKD\b|HK\$|\bKRW\b|[¥€£₩])/i;

/** Same concatenation order as irc.ts so the rules can't drift apart. */
function searchText(l: ReceiptLine): string {
  return `${l.rawText ?? ""} ${l.description}`;
}

function isTaxLine(l: ReceiptLine): boolean {
  return TAX_RE.test(searchText(l));
}

function hasForeignCurrency(l: ReceiptLine): boolean {
  return FOREIGN_CURRENCY_RE.test(searchText(l));
}

function hasParentCode(l: ReceiptLine): boolean {
  // Single source of truth with Story 1.5's IRC parent-code rule
  // (PARENT_CODE_RE has no `g` flag → `.test` is stateless / safe).
  return PARENT_CODE_RE.test(searchText(l));
}

/**
 * Classify a parsed receipt's structure. Deterministic precedence when
 * several signals co-occur: tax > currency > no-product-code >
 * structural. The empty / nothing-to-classify case is a degenerate
 * gate (fail-closed → reject) checked first so it never falls through
 * to a misleading reason.
 */
export function classifyReceiptStructure(
  parsed: ParsedReceipt,
): StructureClassification {
  const lines = parsed.lines;

  // Degenerate: nothing to structurally confirm → reject (fail-closed).
  if (lines.length === 0) {
    return { ok: false, reason: "structural_inconsistency" };
  }

  // Whole concatenated receipt is scanned, so a disqualifier on ANY
  // page (1.2b/1.5 already concatenated, no page boundaries) triggers
  // regardless of position (AC3 / CIP multi-page fold-in).
  if (lines.some(isTaxLine)) {
    return { ok: false, reason: "independent_tax_line" };
  }
  if (lines.some(hasForeignCurrency)) {
    return { ok: false, reason: "foreign_currency" };
  }
  if (!lines.some(hasParentCode)) {
    return { ok: false, reason: "no_recognizable_product_code" };
  }
  // A #5564 receipt always has at least one positive product line; an
  // all-negative / no-positive parse is structurally not #5564.
  if (!lines.some((l) => l.amountCents > 0)) {
    return { ok: false, reason: "structural_inconsistency" };
  }

  return { ok: true };
}
