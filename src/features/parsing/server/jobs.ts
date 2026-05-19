/**
 * Session + parse-job persistence — Story 1.3 (AC1/AC2/AC5).
 *
 * Uses the EXISTING Drizzle schema (1.1: sessions, parse_jobs) — no
 * table changes (AC6/AC10). Server runs in the Node runtime (no edge),
 * so node:crypto is available.
 */
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { parseJobs, sessions } from "@/db/schema";

/**
 * Create a split session. The id IS the linkId. The canonical
 * unguessable-link scheme is Story 3.1 — this server-generated UUID is
 * a non-guessable placeholder 3.1 will formalize (not pre-empted here).
 */
export async function createSession(): Promise<string> {
  const id = randomUUID();
  await db.insert(sessions).values({ id }).onConflictDoNothing();
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
    .where(eq(parseJobs.id, jobId));
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
    .where(eq(parseJobs.id, jobId));
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
