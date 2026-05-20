/**
 * Story 6.1 — 30-day verifiable destroy (NFR-S4 FR44).
 *
 * Runs one cleanup pass: find sessions with `expires_at < NOW()`,
 * delete every dependent row (claims / claim_changes / identities /
 * llm_costs / receipt_lines / parse_jobs), then the session row
 * itself, then verify by counting that zero descendants remain
 * (the "verifiable" half of the NFR). Returns a structured report
 * the worker logs.
 *
 * The cascade order matters: FKs are `ON DELETE no action` on every
 * child (per architecture convention), so we must delete bottom-up.
 */
import { count, inArray, lt } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  claimChanges,
  claims,
  identities,
  llmCosts,
  parseJobs,
  receiptLines,
  sessions,
} from "@/db/schema";

export interface DestroyReport {
  expiredSessionCount: number;
  deletedSessionIds: string[];
  deleted: {
    claims: number;
    claimChanges: number;
    identities: number;
    llmCosts: number;
    receiptLines: number;
    parseJobs: number;
    sessions: number;
  };
  /** Post-delete verification — descendants of deleted sessions. */
  residual: {
    claims: number;
    claimChanges: number;
    identities: number;
    llmCosts: number;
    receiptLines: number;
    parseJobs: number;
  };
  /** True when every residual count is 0 (deletion fully verified). */
  verified: boolean;
}

export async function runDestructionPass(
  now: Date = new Date(),
): Promise<DestroyReport> {
  const expiredRows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(lt(sessions.expiresAt, now));

  const ids = expiredRows.map((r) => r.id);

  const report: DestroyReport = {
    expiredSessionCount: ids.length,
    deletedSessionIds: ids,
    deleted: {
      claims: 0,
      claimChanges: 0,
      identities: 0,
      llmCosts: 0,
      receiptLines: 0,
      parseJobs: 0,
      sessions: 0,
    },
    residual: {
      claims: 0,
      claimChanges: 0,
      identities: 0,
      llmCosts: 0,
      receiptLines: 0,
      parseJobs: 0,
    },
    verified: true,
  };

  if (ids.length === 0) return report;

  await db.transaction(async (tx) => {
    // Bottom-up cascade: children → parent.
    const delClaims = await tx
      .delete(claims)
      .where(inArray(claims.sessionId, ids))
      .returning({ id: claims.id });
    report.deleted.claims = delClaims.length;

    const delChanges = await tx
      .delete(claimChanges)
      .where(inArray(claimChanges.sessionId, ids))
      .returning({ id: claimChanges.id });
    report.deleted.claimChanges = delChanges.length;

    const delIdent = await tx
      .delete(identities)
      .where(inArray(identities.sessionId, ids))
      .returning({ id: identities.id });
    report.deleted.identities = delIdent.length;

    const delLlm = await tx
      .delete(llmCosts)
      .where(inArray(llmCosts.sessionId, ids))
      .returning({ id: llmCosts.id });
    report.deleted.llmCosts = delLlm.length;

    const delLines = await tx
      .delete(receiptLines)
      .where(inArray(receiptLines.sessionId, ids))
      .returning({ id: receiptLines.id });
    report.deleted.receiptLines = delLines.length;

    const delJobs = await tx
      .delete(parseJobs)
      .where(inArray(parseJobs.sessionId, ids))
      .returning({ id: parseJobs.id });
    report.deleted.parseJobs = delJobs.length;

    const delSessions = await tx
      .delete(sessions)
      .where(inArray(sessions.id, ids))
      .returning({ id: sessions.id });
    report.deleted.sessions = delSessions.length;
  });

  // Verification pass — count any descendants still pointing at the
  // deleted session ids. Zero across the board = verifiable
  // destruction (NFR-S4 "verifiable"). Per-table queries keep
  // drizzle's table-typed query builder happy without casts.
  const [
    rClaims,
    rChanges,
    rIdent,
    rLlm,
    rLines,
    rJobs,
  ] = await Promise.all([
    db.select({ n: count() }).from(claims).where(inArray(claims.sessionId, ids)),
    db
      .select({ n: count() })
      .from(claimChanges)
      .where(inArray(claimChanges.sessionId, ids)),
    db
      .select({ n: count() })
      .from(identities)
      .where(inArray(identities.sessionId, ids)),
    db
      .select({ n: count() })
      .from(llmCosts)
      .where(inArray(llmCosts.sessionId, ids)),
    db
      .select({ n: count() })
      .from(receiptLines)
      .where(inArray(receiptLines.sessionId, ids)),
    db
      .select({ n: count() })
      .from(parseJobs)
      .where(inArray(parseJobs.sessionId, ids)),
  ]);
  report.residual.claims = Number(rClaims[0]?.n ?? 0);
  report.residual.claimChanges = Number(rChanges[0]?.n ?? 0);
  report.residual.identities = Number(rIdent[0]?.n ?? 0);
  report.residual.llmCosts = Number(rLlm[0]?.n ?? 0);
  report.residual.receiptLines = Number(rLines[0]?.n ?? 0);
  report.residual.parseJobs = Number(rJobs[0]?.n ?? 0);

  report.verified =
    report.residual.claims === 0 &&
    report.residual.claimChanges === 0 &&
    report.residual.identities === 0 &&
    report.residual.llmCosts === 0 &&
    report.residual.receiptLines === 0 &&
    report.residual.parseJobs === 0;

  return report;
}
