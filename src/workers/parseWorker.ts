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
            // Guard the TERMINAL write: a DB blip here must NOT rethrow
            // (pg-boss would re-run the whole Claude parse — the design
            // explicitly avoids that) and must still leave a terminal
            // state (NFR-R2 — payer never deadlocked).
            try {
              await markJobStatus(
                data.jobId,
                outcome.degraded ? "degraded" : "succeeded",
              );
            } catch (e) {
              console.error(
                "[parseWorker] terminal markJobStatus failed:",
                e instanceof Error ? e.message : String(e),
              );
              await markJobFailed(data.jobId, FRIENDLY_UNEXPECTED).catch(
                () => {},
              );
            }
            output = outcome.receipt; // pg-boss job output (W-1-4-3)
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
