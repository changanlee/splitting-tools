/**
 * Session + parse-job persistence — Story 1.3 (AC1/AC2/AC5).
 *
 * Uses the EXISTING Drizzle schema (1.1: sessions, parse_jobs) — no
 * table changes (AC6/AC10). Server runs in the Node runtime (no edge),
 * so node:crypto is available.
 */
import { randomUUID } from "node:crypto";

import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { parseJobs, sessions } from "@/db/schema";
import { generateLinkId } from "@/lib/linkId";
import { expiresAt } from "@/features/lifecycle/expiry";

/** Terminal statuses are FINAL — never overwritten (a pg-boss
 *  redelivery / double-process must not resurrect a finished job). */
const TERMINAL: string[] = ["succeeded", "failed", "degraded"];

/**
 * Create a split session. The id IS the linkId. The canonical
 * unguessable-link scheme is Story 3.1 — this server-generated UUID is
 * a non-guessable placeholder 3.1 will formalize (not pre-empted here).
 *
 * `creatorTokenHash` (Feature B) — the sha256 of the payer's device
 * token, recorded so the payer can later be recognised as the session
 * owner (pre-allocate claims for anyone). Optional: a missing token
 * just means owner-mode is unavailable for that session.
 */
export async function createSession(
  creatorTokenHash?: string | null,
): Promise<string> {
  // Story 3.1 — 16-byte crypto-random → base64url (≥128-bit entropy;
  // NFR-S1). Architecture L256-258 explicitly rejects UUIDv4. The
  // returned id IS the link.
  const id = generateLinkId();
  // Story 6.1 — stamp expires_at = now + 30d (NFR-S4). The
  // lifecycleWorker deletes sessions where expires_at < NOW().
  const now = new Date();
  await db
    .insert(sessions)
    .values({
      id,
      expiresAt: expiresAt(now),
      creatorTokenHash: creatorTokenHash ?? null,
    })
    .onConflictDoNothing();
  return id;
}

/** Does a session/link exist? Lets the submit route return a clean
 *  404 instead of an FK violation surfacing as a generic 502. */
export async function sessionExists(linkId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  return rows.length > 0;
}

/** Create a queued parse_jobs row for an existing session. */
export async function createQueuedJob(sessionId: string): Promise<string> {
  const id = randomUUID();
  await db
    .insert(parseJobs)
    .values({ id, sessionId, status: "queued" });
  return id;
}

/**
 * Mark a job failed with a FRIENDLY message (NFR-R1: never store raw
 * errors). Used when enqueue fails after the row was created, so the
 * poller reaches a terminal state instead of spinning forever.
 */
export async function markJobFailed(
  jobId: string,
  friendlyMessage: string,
): Promise<void> {
  await db
    .update(parseJobs)
    .set({ status: "failed", error: friendlyMessage, updatedAt: new Date() })
    .where(
      and(eq(parseJobs.id, jobId), notInArray(parseJobs.status, TERMINAL)),
    );
}

/**
 * Set a job to a non-failed status (processing/succeeded/degraded) —
 * Story 1.4 parseWorker. `friendlyMessage` only ever holds friendly
 * copy (NFR-R1); raw errors never reach this column.
 */
export async function markJobStatus(
  jobId: string,
  status: "processing" | "succeeded" | "degraded",
  friendlyMessage?: string,
): Promise<void> {
  await db
    .update(parseJobs)
    .set({
      status,
      ...(friendlyMessage !== undefined ? { error: friendlyMessage } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(parseJobs.id, jobId), notInArray(parseJobs.status, TERMINAL)),
    );
}

/**
 * Read a job's status, scoped to its session/link (basic ownership
 * check — full device-token authz is Epic 4). Returns null if the job
 * does not exist OR does not belong to `linkId`. O(1) via the
 * idx_parse_jobs_session_id / PK.
 */
export async function getJobStatus(
  jobId: string,
  linkId: string,
): Promise<{ status: string; error: string | null } | null> {
  const rows = await db
    .select({
      status: parseJobs.status,
      error: parseJobs.error,
      sessionId: parseJobs.sessionId,
    })
    .from(parseJobs)
    .where(eq(parseJobs.id, jobId))
    .limit(1);

  const row = rows[0];
  if (!row || row.sessionId !== linkId) return null;
  return { status: row.status, error: row.error };
}
