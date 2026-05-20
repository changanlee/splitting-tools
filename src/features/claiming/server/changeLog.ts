/**
 * Story 4.9 — payer change log. Append-only into claim_changes. Used
 * by 4.6 undo (reads latest entry for the identity) and the future
 * payer audit UI (not in v1 scope).
 */
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { claimChanges } from "@/db/schema";

export type ClaimChangeAction =
  | "claim"
  | "unclaim"
  | "weight"
  | "force-pass"
  | "undo";

export async function appendChange(args: {
  sessionId: string;
  receiptLineId: string | null;
  identityId: string | null;
  action: ClaimChangeAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(claimChanges).values({
    sessionId: args.sessionId,
    receiptLineId: args.receiptLineId,
    identityId: args.identityId,
    action: args.action,
    details: args.details ? JSON.stringify(args.details) : null,
  });
}

export interface LatestChange {
  id: number;
  receiptLineId: string | null;
  action: string;
  details: string | null;
}

/** Latest change for an identity within a session — drives 4.6 undo. */
export async function latestChangeForIdentity(
  sessionId: string,
  identityId: string,
): Promise<LatestChange | null> {
  const rows = await db
    .select({
      id: claimChanges.id,
      receiptLineId: claimChanges.receiptLineId,
      action: claimChanges.action,
      details: claimChanges.details,
    })
    .from(claimChanges)
    .where(
      and(
        eq(claimChanges.sessionId, sessionId),
        eq(claimChanges.identityId, identityId),
      ),
    )
    .orderBy(desc(claimChanges.id))
    .limit(1);
  return rows[0] ?? null;
}
