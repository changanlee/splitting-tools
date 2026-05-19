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
      for (const job of jobs) {
        const data = job.data;
        try {
          await markJobStatus(data.jobId, "processing");
          const outcome = await parseReceiptImages(
            data.images,
            data.mimeTypes,
            { sessionId: data.sessionId, jobId: data.jobId },
          );
          if (outcome.kind === "parsed") {
            await markJobStatus(
              data.jobId,
              outcome.degraded ? "degraded" : "succeeded",
            );
            // Returned → persisted as pg-boss job output (1.4→1.5
            // hand-off; no app table — W-1-4-3).
            return outcome.receipt;
          }
          // Friendly terminal failure (visionAdapter exhausted its
          // chain). Resolve — do NOT throw (no double retry).
          await markJobFailed(data.jobId, outcome.message);
        } catch (e) {
          // visionAdapter never throws raw, but stay defensive: reach a
          // terminal state, friendly only (NFR-R1/R2).
          console.error("[parseWorker] unexpected error:", e);
          await markJobFailed(data.jobId, FRIENDLY_UNEXPECTED).catch(() => {});
        }
      }
      return undefined;
    },
  );
}
