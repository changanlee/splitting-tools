/**
 * matchWorker — THE pg-boss `match` consumer (Story 8.1, photo-assisted
 * claim). Runs ONLY in the worker process (NFR-L4). Calls the single
 * vision boundary `matchProductsAdapter.matchProductsToLines` (never
 * bypasses it), then seeds high-confidence matches as preliminary claims
 * for the photographing identity.
 *
 * Best-effort throughout (NFR-R2): the adapter never throws and returns
 * `{matches:[]}` on any failure; the handler swallows its own errors and
 * resolves — a failed photo-match must NEVER block manual claiming or
 * deadlock the queue. Nothing here is on the critical settlement path.
 */
import type { PgBoss } from "pg-boss";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { sessions } from "@/db/schema";
import { isFrozen } from "@/features/settlement/freeze";
import { pickConfidentMatches } from "@/features/claiming/photoMatch";
import {
  listClaimableLines,
  seedClaims,
} from "@/features/claiming/server/claimRepo";
import {
  MATCH_QUEUE,
  type MatchJobPayload,
} from "@/features/claiming/server/matchQueue";
import { matchProductsToLines } from "@/lib/llm/matchProductsAdapter";

export async function registerMatchWorker(boss: PgBoss): Promise<void> {
  try {
    await boss.createQueue(MATCH_QUEUE);
  } catch (e) {
    console.warn("[matchWorker] createQueue:", e);
  }
  await boss.work(
    MATCH_QUEUE,
    async (jobs: { id: string; data: MatchJobPayload }[]) => {
      for (const job of jobs) {
        const d = job.data;
        if (!d || !d.sessionId || !d.identityId) {
          console.error("[matchWorker] job missing data — skipped");
          continue;
        }
        try {
          // Story 5.5 read-only-after-finalize: never seed claims onto a
          // frozen session (the route also rejects, but freeze can land
          // between enqueue and processing — this is the authoritative
          // write-time guard). Skip before the paid LLM call.
          const sess = await db
            .select({ status: sessions.status })
            .from(sessions)
            .where(eq(sessions.id, d.sessionId))
            .limit(1);
          if (!sess[0] || isFrozen(sess[0].status)) continue;

          const lines = await listClaimableLines(d.sessionId);
          if (lines.length === 0) continue; // nothing to claim against
          const { matches } = await matchProductsToLines(
            d.images,
            d.mimeTypes,
            lines,
            d.sessionId,
          );
          const { autoClaim } = pickConfidentMatches(
            matches,
            lines.map((l) => l.lineNo),
          );
          if (autoClaim.length > 0) {
            const seeded = await seedClaims({
              sessionId: d.sessionId,
              identityId: d.identityId,
              lineNos: autoClaim,
            });
            console.log(
              `[matchWorker] seeded ${seeded} preliminary claim(s) for identity ${d.identityId}`,
            );
          }
        } catch (e) {
          // Best-effort: log message only (NFR-S3 — never the full error
          // object, which could carry image context) and move on. A
          // photo-match failure must not block manual claiming (NFR-R2).
          console.error(
            "[matchWorker] match failed (manual claim unaffected):",
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    },
  );
}
