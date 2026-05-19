/**
 * Persist IRC-attributed receipt lines — Story 1.5 (AC6).
 *
 * Glue (not node-tested per the established strategy — the maths is in
 * the pure `irc.ts`). Idempotent: a pg-boss redelivery of the same job
 * must not duplicate rows, so this clears the job's existing lines then
 * inserts fresh. parsed_sum is intentionally NOT stored as a column —
 * it is `Σ gross_cents` over a job's receipt_lines (no schema bloat;
 * spec AC6).
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { receiptLines } from "@/db/schema";
import type { AttributedReceipt } from "@/features/parsing/irc";

export async function persistReceiptLines(
  parseJobId: string,
  sessionId: string,
  attributed: AttributedReceipt,
): Promise<void> {
  await db.delete(receiptLines).where(eq(receiptLines.parseJobId, parseJobId));
  if (attributed.lines.length === 0) return;

  // Assign stable ids; map a parent's lineNo → its row id so an IRC
  // line's `ircAttributedTo` (a lineNo) becomes the parent's row id.
  const idByLineNo = new Map<number, string>();
  const withIds = attributed.lines.map((l) => {
    const id = randomUUID();
    idByLineNo.set(l.lineNo, id);
    return { id, l };
  });

  await db.insert(receiptLines).values(
    withIds.map(({ id, l }) => ({
      id,
      sessionId,
      parseJobId,
      lineNo: l.lineNo,
      description: l.description,
      rawText: l.rawText ?? null,
      qty: l.qty,
      grossCents: l.grossCents,
      netCents: l.netCents,
      isIrc: l.isIrc,
      claimable: l.claimable,
      ircAttributedTo:
        l.ircAttributedTo != null
          ? (idByLineNo.get(l.ircAttributedTo) ?? null)
          : null,
      orphan: l.orphan,
    })),
  );
}
