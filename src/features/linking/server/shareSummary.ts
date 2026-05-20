/**
 * Story 3.2/3.3 — share-page read model. Returns the minimum fields
 * the anti-scam MessageCard needs (date / total / item count / payer
 * placeholder). Payer name is Epic 4 territory; for v1 the message
 * card shows "付款人" as a placeholder.
 */
import { count, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { receiptLines, sessions } from "@/db/schema";

export interface ShareSummary {
  linkId: string;
  createdAt: Date;
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
  lineCount: number;
  currency: string | null;
}

export async function getShareSummary(
  linkId: string,
): Promise<ShareSummary | null> {
  const sess = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      printedTotalCents: sessions.printedTotalCents,
      unverified: sessions.unverified,
      currency: sessions.currency,
    })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  if (!sess[0]) return null;

  const agg = await db
    .select({
      lineCount: count(),
      grossSum: sql<number>`COALESCE(SUM(${receiptLines.grossCents}), 0)`,
    })
    .from(receiptLines)
    .where(eq(receiptLines.sessionId, linkId));

  return {
    linkId,
    createdAt: sess[0].createdAt,
    parsedSumCents: Number(agg[0]?.grossSum ?? 0),
    printedTotalCents: sess[0].printedTotalCents,
    unverified: sess[0].unverified,
    lineCount: Number(agg[0]?.lineCount ?? 0),
    currency: sess[0].currency,
  };
}
