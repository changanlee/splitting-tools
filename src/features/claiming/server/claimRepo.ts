/**
 * Story 4.4 — claim repo + per-line / per-identity aggregations.
 * Server-only. Glue not node-tested; the pure share maths is in 4.5.
 */
import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

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

/** Story 8.1 — claimable (non-IRC) lines with their lineNo + name, for
 *  the photo-match vision call (matchWorker → matchProductsAdapter). */
export async function listClaimableLines(
  sessionId: string,
): Promise<{ lineNo: number; description: string }[]> {
  return db
    .select({
      lineNo: receiptLines.lineNo,
      description: receiptLines.description,
    })
    .from(receiptLines)
    .where(
      and(
        eq(receiptLines.sessionId, sessionId),
        eq(receiptLines.claimable, true),
      ),
    )
    .orderBy(asc(receiptLines.lineNo));
}

/**
 * Story 8.1 — seed preliminary claims for an identity from photo-match
 * lineNos. ADDITIVE + NON-DESTRUCTIVE: resolves lineNos → claimable line
 * ids in this session, inserts a weight-1 claim per line, and relies on
 * the unique (receipt_line_id, identity_id) index to no-op any line this
 * identity already claimed (`onConflictDoNothing`). Returns how many new
 * claims were created. Never touches other identities' claims.
 */
export async function seedClaims(args: {
  sessionId: string;
  identityId: string;
  lineNos: number[];
}): Promise<number> {
  if (args.lineNos.length === 0) return 0;
  const rows = await db
    .select({ id: receiptLines.id, lineNo: receiptLines.lineNo })
    .from(receiptLines)
    .where(
      and(
        eq(receiptLines.sessionId, args.sessionId),
        eq(receiptLines.claimable, true),
      ),
    );
  const idByLineNo = new Map(rows.map((r) => [r.lineNo, r.id]));
  const values = args.lineNos
    .map((n) => idByLineNo.get(n))
    .filter((id): id is string => id != null)
    .map((receiptLineId) => ({
      id: randomUUID(),
      sessionId: args.sessionId,
      receiptLineId,
      identityId: args.identityId,
      weight: 1,
    }));
  if (values.length === 0) return 0;
  const inserted = await db
    .insert(claims)
    .values(values)
    .onConflictDoNothing({
      target: [claims.receiptLineId, claims.identityId],
    })
    .returning({ id: claims.id });
  return inserted.length;
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
