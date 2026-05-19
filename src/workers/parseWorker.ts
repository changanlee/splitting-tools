/**
 * parseWorker — THE pg-boss `parse` consumer (Story 1.4, AC1/AC7/AC8).
 *
 * Completes the producer/consumer pair (1.3 = producer-only). Runs ONLY
 * in the worker process (NFR-L4). Calls the single Claude boundary
 * `visionAdapter.parseReceiptImages` (never bypasses it), then writes
 * the terminal app status to `parse_jobs` (the 1.3 ParseProgress poll
 * reflects it with no change). The parsed receipt is returned so
 * pg-boss persists it as the job `output` — the 1.4→1.5 hand-off with
 * NO app schema-table change (deferred-work W-1-4-3: Story 1.5
 * formalizes receipt_lines persistence).
 *
 * The handler RESOLVES (never throws) once a terminal app state is
 * written: visionAdapter already owns retry+degradation (NFR-L1/R1), so
 * a pg-boss job-level retry would wastefully re-run the whole parse.
 * NFR-R2: the payer is never deadlocked — the job always reaches
 * succeeded/degraded/failed.
 */
import type { PgBoss } from "pg-boss";

import {
  PARSE_QUEUE,
  type ParseJobPayload,
} from "@/features/parsing/server/queue";
import {
  markJobFailed,
  markJobStatus,
} from "@/features/parsing/server/jobs";
import { parseReceiptImages } from "@/lib/llm/visionAdapter";
import { attributeIrc } from "@/features/parsing/irc";
import { persistReceiptLines } from "@/features/parsing/server/persistReceiptLines";
import { classifyReceiptStructure } from "@/features/parsing/structureGuard";
import { STRUCTURE_REJECT_MESSAGE } from "@/features/parsing/schema";

const FRIENDLY_UNEXPECTED =
  "收據解析暫時失敗，請稍後再試一次。";

export async function registerParseWorker(boss: PgBoss): Promise<void> {
  await boss.work(
    PARSE_QUEUE,
    async (jobs: { id: string; data: ParseJobPayload }[]) => {
      // pg-boss `work` defaults to one job per call; we still process
      // the WHOLE array (never `return` mid-loop) so a future batch>1
      // can't silently drop jobs. `output` is the parsed receipt (the
      // 1.4→1.5 hand-off; one-job contract).
      let output: unknown = undefined;
      for (const job of jobs) {
        const data = job.data;
        if (!data || !data.jobId) {
          console.error("[parseWorker] job missing data/jobId — skipped");
          continue;
        }
        try {
          await markJobStatus(data.jobId, "processing");
          const outcome = await parseReceiptImages(
            data.images,
            data.mimeTypes,
            { sessionId: data.sessionId, jobId: data.jobId },
          );
          if (outcome.kind === "parsed") {
            output = outcome.receipt; // pg-boss job output (W-1-4-3)
            // Story 1.6 (FR7 v1 hard-lock): structure gate BEFORE any
            // IRC/persist. A non-#5564 structure is rejected with the
            // single friendly message (NFR-R1 — the internal reason is
            // server-log only) and writes NO receipt_lines, so the
            // payer is never silently mis-billed. This is a NORMAL
            // control-flow branch (not a throw): it goes through
            // markJobFailed like the visionAdapter-exhausted path and
            // must not fall into the unexpected-error catch.
            const structure = classifyReceiptStructure(outcome.receipt);
            if (!structure.ok) {
              console.error(
                "[parseWorker] receipt structure rejected (FR7):",
                structure.reason,
              );
              await markJobFailed(
                data.jobId,
                STRUCTURE_REJECT_MESSAGE,
              ).catch((e) =>
                console.error(
                  "[parseWorker] markJobFailed (structure):",
                  e instanceof Error ? e.message : String(e),
                ),
              );
              continue;
            }
            // Story 1.5: IRC attribution + receipt_lines persistence in
            // the SAME success path (W-1-4-3 hand-off; no cross-process
            // pg-boss-output read). A DB blip must NOT rethrow (pg-boss
            // would re-run the whole Claude parse — explicitly avoided)
            // and must still leave the payer un-deadlocked (NFR-R2).
            let persisted = false;
            try {
              const attributed = attributeIrc(outcome.receipt);
              await persistReceiptLines(
                data.jobId,
                data.sessionId,
                attributed,
              );
              persisted = true;
              await markJobStatus(
                data.jobId,
                outcome.degraded ? "degraded" : "succeeded",
              );
            } catch (e) {
              console.error(
                "[parseWorker] IRC persist / terminal write failed:",
                e instanceof Error ? e.message : String(e),
              );
              // If receipt_lines were already written, do NOT mark the
              // job failed: markJobFailed's terminal guard would turn a
              // transient status-write blip into a PERMANENT wrong
              // "failed" that hides the correct rows. Leave it
              // non-terminal — pg-boss redelivery re-runs the
              // (transactional, idempotent) persist + status write and
              // self-heals once the DB recovers. Only an attribution /
              // persist failure (no rows) marks failed (best-effort).
              if (!persisted) {
                await markJobFailed(data.jobId, FRIENDLY_UNEXPECTED).catch(
                  () => {},
                );
              }
            }
          } else {
            // Friendly terminal failure (visionAdapter exhausted its
            // chain). Resolve — never throw (no pg-boss double retry).
            await markJobFailed(data.jobId, outcome.message).catch((e) =>
              console.error(
                "[parseWorker] markJobFailed:",
                e instanceof Error ? e.message : String(e),
              ),
            );
          }
        } catch (e) {
          // visionAdapter never throws raw; stay defensive. Log only
          // the message (NEVER the full error object — it could carry
          // request/image context; NFR-S3). Reach a terminal state.
          console.error(
            "[parseWorker] unexpected error:",
            e instanceof Error ? e.message : String(e),
          );
          await markJobFailed(data.jobId, FRIENDLY_UNEXPECTED).catch(() => {});
        }
      }
      return output;
    },
  );
}
