/**
 * IRC discount attribution + parsed_sum — Story 1.5 (FR6). PURE, NO IO
 * — fully node-testable. The canvas/SDK/DB glue (parseWorker /
 * persistReceiptLines) calls this; the maths lives here.
 *
 * Contract (architecture L396-398): an IRC line is a NEGATIVE-amount
 * line that references a parent product code (#5564: "IRC #8511322" or
 * "#8519804 IRC"). It is folded into its parent — parent
 * `net_cents = gross + Σ(its IRC, all negative)` — and is itself NOT
 * independently claimable. An IRC with no matching parent is an
 * "orphan": kept (never dropped / never mis-accounted), counted in
 * parsed_sum as a standalone negative, flagged for the Epic 2
 * reconciliation gate. All maths is INTEGER CENTS (no float).
 */
import type { ParsedReceipt, ReceiptLine } from "@/features/parsing/schema";

export interface AttributedLine {
  /** 1-based order (receipt top→bottom; cross-page already concatenated). */
  lineNo: number;
  description: string;
  rawText?: string;
  qty: number;
  /** Original line amount (integer cents; IRC lines are negative). */
  grossCents: number;
  /** Parent = gross + Σ(child IRC); normal = gross; IRC = own amount. */
  netCents: number;
  isIrc: boolean;
  /** IRC lines are never independently claimable (AC1). */
  claimable: boolean;
  /** IRC line → parent `lineNo`; parent/normal/orphan → null. */
  ircAttributedTo: number | null;
  /** IRC with no matching parent (AC3) — kept, not dropped. */
  orphan: boolean;
}

export interface AttributedReceipt {
  lines: AttributedLine[];
}

/** `#<digits>` reference inside an IRC line → the PARENT's product code. */
const IRC_REF_RE = /#\s*(\d{3,})/;
/**
 * Leading product code of an ordinary line (#5564: "8517238 1x 16.50").
 * Exported so Story 1.6's structure guard matches "is this a #5564-style
 * product-code line?" with the SAME rule — one source of truth, no
 * two-regex drift. No `g` flag → safe to share (`.match`/`.test` don't
 * mutate). Read-only consumer; the IRC algorithm is unchanged.
 */
export const PARENT_CODE_RE = /(?:^|\s)(\d{3,})\b/;

function isIrcLine(l: ReceiptLine): boolean {
  return l.amountCents < 0;
}

function ircRefCode(l: ReceiptLine): string | null {
  const m = `${l.rawText ?? ""} ${l.description}`.match(IRC_REF_RE);
  return m ? m[1] : null;
}

function parentCode(l: ReceiptLine): string | null {
  const m = `${l.rawText ?? ""} ${l.description}`.match(PARENT_CODE_RE);
  return m ? m[1] : null;
}

/**
 * Attribute every IRC line to its parent and compute per-line net.
 * Pure & deterministic — independent of cross-page ordering because
 * matching is by product code, not position.
 */
export function attributeIrc(parsed: ParsedReceipt): AttributedReceipt {
  const lines: AttributedLine[] = parsed.lines.map((l, i) => ({
    lineNo: i + 1,
    description: l.description,
    rawText: l.rawText,
    qty: l.qty,
    grossCents: l.amountCents,
    netCents: l.amountCents, // refined below for parents
    isIrc: false,
    claimable: true,
    ircAttributedTo: null,
    orphan: false,
  }));

  // First non-IRC line per product code is the canonical parent
  // (preserve order; a duplicate code → first wins, Epic 2 handles
  // ambiguity — out of scope here).
  const parentByCode = new Map<string, AttributedLine>();
  parsed.lines.forEach((l, i) => {
    if (isIrcLine(l)) return;
    const code = parentCode(l);
    if (code && !parentByCode.has(code)) parentByCode.set(code, lines[i]);
  });

  parsed.lines.forEach((l, i) => {
    if (!isIrcLine(l)) return;
    const al = lines[i];
    al.isIrc = true;
    al.claimable = false; // IRC is never independently claimable (AC1)
    const code = ircRefCode(l);
    let parent = code ? parentByCode.get(code) : undefined;
    // Positional fallback (2026-06-21, foreign receipts): many receipts
    // (Korean/Japanese promos, e.g. "★행사상품 -920") print the discount
    // line directly UNDER the item it applies to, with NO #code
    // cross-reference, so code matching can't find a parent. Attribute
    // such a code-less IRC to the nearest preceding non-IRC product line.
    // Guard on `code === null`: a line that HAS a code but matched nothing
    // is a genuine orphan in the code-based (#5564) format — leave it so,
    // because there position does NOT imply parenthood.
    if (!parent && code === null) {
      for (let j = i - 1; j >= 0; j--) {
        if (!isIrcLine(parsed.lines[j])) {
          parent = lines[j];
          break;
        }
      }
    }
    if (parent) {
      al.ircAttributedTo = parent.lineNo;
      al.orphan = false;
      parent.netCents += l.amountCents; // amount is negative
    } else {
      // Orphan IRC: kept, counted, flagged — never dropped, never
      // mis-accounted (AC3; Epic 2 reconciliation can re-bind). Now only
      // when a coded IRC misses, or a code-less one has no item above it.
      al.ircAttributedTo = null;
      al.orphan = true;
    }
  });

  return { lines };
}

/**
 * parsed_sum in INTEGER CENTS (AC4). Equals the conservation total
 * `Σ grossCents` (folding IRC into parents never changes the sum) AND
 * the decomposition `Σ(claimable net) + Σ(orphan IRC gross)` — both are
 * asserted equal in the tests.
 */
export function computeParsedSum(r: AttributedReceipt): number {
  return r.lines.reduce((acc, l) => acc + l.grossCents, 0);
}
