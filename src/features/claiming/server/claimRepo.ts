/**
 * Story 4.4 — claim repo + per-line / per-identity aggregations.
 * Server-only. Glue not node-tested; the pure share maths is in 4.5.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { claims, identities, receiptLines } from "@/db/schema";

export interface ClaimRow {
  id: string;
  receiptLineId: string;
  identityId: string;
  weight: number;
  identityName: string;
}

/** All claims for a session — joined with the identity's name. */
export async function listClaims(sessionId: string): Promise<ClaimRow[]> {
  return db
    .select({
      id: claims.id,
      receiptLineId: claims.receiptLineId,
      identityId: claims.identityId,
      weight: claims.weight,
      identityName: identities.name,
    })
    .from(claims)
    .innerJoin(identities, eq(claims.identityId, identities.id))
    .where(eq(claims.sessionId, sessionId));
}

/** Toggle claim: insert if missing, delete if present. Returns the
 *  resulting state for the (line, identity) pair. */
export async function toggleClaim(args: {
  sessionId: string;
  receiptLineId: string;
  identityId: string;
}): Promise<{ claimed: boolean }> {
  const existing = await db
    .select({ id: claims.id })
    .from(claims)
    .where(
      and(
        eq(claims.receiptLineId, args.receiptLineId),
        eq(claims.identityId, args.identityId),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db.delete(claims).where(eq(claims.id, existing[0].id));
    return { claimed: false };
  }
  await db.insert(claims).values({
    id: randomUUID(),
    sessionId: args.sessionId,
    receiptLineId: args.receiptLineId,
    identityId: args.identityId,
    weight: 1,
  });
  return { claimed: true };
}

/** Verify (sessionId, receiptLineId) belongs to a claimable line. */
export async function lineBelongsToSession(
  sessionId: string,
  receiptLineId: string,
): Promise<boolean> {
  const rows = await db
    .select({
      id: receiptLines.id,
      claimable: receiptLines.claimable,
    })
    .from(receiptLines)
    .where(
      and(
        eq(receiptLines.sessionId, sessionId),
        eq(receiptLines.id, receiptLineId),
      ),
    )
    .limit(1);
  return rows[0]?.claimable ?? false;
}
