/**
 * Persist IRC-attributed receipt lines — Story 1.5 (AC6).
 *
 * Glue (not node-tested per the established strategy — the maths is in
 * the pure `irc.ts`). Idempotent under pg-boss at-least-once redelivery:
 * clears the job's existing lines then inserts fresh, ATOMICALLY (single
 * transaction) so a crash / insert failure rolls back and a prior
 * successful attempt's rows are never left deleted-but-not-replaced.
 * The `unique(parse_job_id, line_no)` constraint (schema.ts) is the
 * DB-level idempotency backstop. parsed_sum is intentionally NOT stored
 * as a column — it is `Σ gross_cents` over a job's receipt_lines (no
 * schema bloat; spec AC6).
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
  // Assign stable ids; map a parent's lineNo → its row id so an IRC
  // line's `ircAttributedTo` (a lineNo) becomes the parent's row id.
  const idByLineNo = new Map<number, string>();
  const withIds = attributed.lines.map((l) => {
    const id = randomUUID();
    idByLineNo.set(l.lineNo, id);
    return { id, l };
  });

  const rows = withIds.map(({ id, l }) => {
    let attributedToId: string | null = null;
    if (l.ircAttributedTo != null) {
      // Non-orphan IRC: its parent line is always present in the same
      // attributed.lines array, so the parent id MUST be in the map.
      // A miss is an algorithm-invariant break — fail loud (project
      // fail-loud convention). Silently writing null would forge an
      // orphan-shaped row with orphan=false and corrupt parsed state.
      const parentId = idByLineNo.get(l.ircAttributedTo);
      if (parentId === undefined) {
        throw new Error(
          `persistReceiptLines: IRC line ${l.lineNo} attributed to ` +
            `missing parent lineNo ${l.ircAttributedTo} (job ${parseJobId})`,
        );
      }
      attributedToId = parentId;
    }
    return {
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
      ircAttributedTo: attributedToId,
      orphan: l.orphan,
    };
  });

  await db.transaction(async (tx) => {
    await tx
      .delete(receiptLines)
      .where(eq(receiptLines.parseJobId, parseJobId));
    if (rows.length === 0) return;
    await tx.insert(receiptLines).values(rows);
  });
}
