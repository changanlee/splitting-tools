/**
 * Story 5.2 — settlement read model. Reads everything settle() needs
 * + identity names, then runs the pure settle() once. Server-only
 * glue; the math is the pure FR50 settle.ts (5.1).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  claims,
  identities,
  receiptLines,
  sessions,
} from "@/db/schema";
import { settle, type SettleResult } from "@/lib/money/settle";

export interface SettlementView {
  sessionId: string;
  status: string;
  unverified: boolean;
  printedTotalCents: number | null;
  parsedSumCents: number;
  /** ISO 4217 stamped by the parser; null when unknown. */
  currency: string | null;
  /** Ordered (largest amount first) — same iteration in plaintext export. */
  perIdentity: { identityId: string; name: string; cents: number }[];
  pendingCents: number;
  orphanIrcCents: number;
}

export async function getSettlementView(
  sessionId: string,
): Promise<SettlementView | null> {
  const sessRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      unverified: sessions.unverified,
      printedTotalCents: sessions.printedTotalCents,
      currency: sessions.currency,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!sessRows[0]) return null;

  const lineRows = await db
    .select({
      id: receiptLines.id,
      netCents: receiptLines.netCents,
      grossCents: receiptLines.grossCents,
      qty: receiptLines.qty,
      isIrc: receiptLines.isIrc,
      claimable: receiptLines.claimable,
      orphan: receiptLines.orphan,
    })
    .from(receiptLines)
    .where(eq(receiptLines.sessionId, sessionId))
    .orderBy(asc(receiptLines.lineNo));

  const claimRows = await db
    .select({
      receiptLineId: claims.receiptLineId,
      identityId: claims.identityId,
      weight: claims.weight,
    })
    .from(claims)
    .where(eq(claims.sessionId, sessionId));

  const identityRows = await db
    .select({ id: identities.id, name: identities.name })
    .from(identities)
    .where(eq(identities.sessionId, sessionId));
  const nameById = new Map(identityRows.map((i) => [i.id, i.name] as const));

  const r: SettleResult = settle(
    lineRows.map((l) => ({
      id: l.id,
      netCents: l.netCents,
      qty: l.qty,
      isIrc: l.isIrc,
      claimable: l.claimable,
      orphan: l.orphan,
    })),
    claimRows,
  );

  const parsedSumCents = lineRows.reduce((a, l) => a + l.grossCents, 0);

  const perIdentity = Array.from(r.byIdentity.entries())
    .map(([identityId, cents]) => ({
      identityId,
      name: nameById.get(identityId) ?? identityId,
      cents,
    }))
    .sort((a, b) => b.cents - a.cents);

  return {
    sessionId,
    status: sessRows[0].status,
    unverified: sessRows[0].unverified,
    printedTotalCents: sessRows[0].printedTotalCents,
    parsedSumCents,
    currency: sessRows[0].currency,
    perIdentity,
    pendingCents: r.pendingCents,
    orphanIrcCents: r.orphanIrcCents,
  };
}
