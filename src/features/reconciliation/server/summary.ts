/**
 * Reconciliation read model — Story 2.1 (AC2/AC3). Server-only glue
 * (NOT node-tested per the established strategy — the maths is the
 * pure `compute.ts`; the SQL/joining is verified by typecheck + build
 * + manual smoke). Zero schema change: reads existing
 * `sessions.printed_total_cents` (1.1) and `receipt_lines` (1.5);
 * `parsed_sum = Σ gross_cents` is the spec-AC6 derived definition
 * (no new column, no cache).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { receiptLines, sessions } from "@/db/schema";

export interface ReceiptLineView {
  id: string;
  lineNo: number;
  description: string;
  rawText: string | null;
  qty: number;
  grossCents: number;
  netCents: number;
  isIrc: boolean;
  claimable: boolean;
  ircAttributedTo: string | null;
  orphan: boolean;
}

export interface ReconciliationSummary {
  sessionId: string;
  parsedSumCents: number; // Σ gross_cents (1.5 AC6 — derived, not stored)
  printedTotalCents: number | null;
  /** Story 2.6 — payer has chosen the FR14 force-pass escape hatch. */
  unverified: boolean;
  /** ISO 4217 stamped by the parser; null when the parse hasn't
   *  successfully run yet or the LLM couldn't detect it. */
  currency: string | null;
  lines: ReceiptLineView[];
}

/**
 * Read summary for a given link id. Returns `null` if the session does
 * not exist (the page route turns this into a 404). Empty `lines` is
 * valid — it means the parse job hasn't produced rows yet (AC3 case 2).
 */
export async function getReconciliationSummary(
  linkId: string,
): Promise<ReconciliationSummary | null> {
  const sessRows = await db
    .select({
      id: sessions.id,
      printedTotalCents: sessions.printedTotalCents,
      unverified: sessions.unverified,
      currency: sessions.currency,
    })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);

  const sess = sessRows[0];
  if (!sess) return null;

  const lineRows = await db
    .select({
      id: receiptLines.id,
      lineNo: receiptLines.lineNo,
      description: receiptLines.description,
      rawText: receiptLines.rawText,
      qty: receiptLines.qty,
      grossCents: receiptLines.grossCents,
      netCents: receiptLines.netCents,
      isIrc: receiptLines.isIrc,
      claimable: receiptLines.claimable,
      ircAttributedTo: receiptLines.ircAttributedTo,
      orphan: receiptLines.orphan,
    })
    .from(receiptLines)
    .where(eq(receiptLines.sessionId, linkId))
    .orderBy(asc(receiptLines.lineNo));

  // parsed_sum = Σ gross_cents — equivalent to a SQL SUM but staying
  // in JS keeps types pure and avoids a separate aggregate round trip
  // for the small row counts we deal with (a Costco receipt is dozens
  // of rows; MAX_PARSE_PAGES=5 bounds it).
  const parsedSumCents = lineRows.reduce(
    (acc, l) => acc + l.grossCents,
    0,
  );

  return {
    sessionId: sess.id,
    parsedSumCents,
    printedTotalCents: sess.printedTotalCents,
    unverified: sess.unverified,
    currency: sess.currency,
    lines: lineRows,
  };
}
