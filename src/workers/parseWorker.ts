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

const FRIENDLY_UNEXPECTED =
  "收據解析暫時失敗，請稍後再試一次。";

export async function registerParseWorker(boss: PgBoss): Promise<void> {
  // pg-boss v12: queue must exist before `work(...)` can subscribe.
  // Idempotent — the producer (queue.ts) ensures it too; safe either
  // start order. A real init failure here would otherwise surface
  // as the misleading "Queue parse does not exist" runtime error.
  try {
    await boss.createQueue(PARSE_QUEUE);
  } catch (e) {
    console.warn("[parseWorker] createQueue:", e);
  }
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
            // FR7 hard-lock REVERTED 2026-05-20 — scope simplified to
            // "OCR any receipt the LLM parses". Any parsed receipt now
            // proceeds straight to IRC attribution + persist, regardless
            // of locale / store / tax structure. The defense-in-depth
            // ParsedReceiptSchema.parse inside visionAdapter still
            // re-validates the LLM payload shape (NFR-R1).
            output = outcome.receipt; // pg-boss job output (W-1-4-3)
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
