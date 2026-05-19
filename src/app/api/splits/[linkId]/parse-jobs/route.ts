/**
 * POST /api/splits/[linkId]/parse-jobs — Story 1.3 (AC1/AC4/AC5/AC6).
 *
 * Accepts ordered multipart masked JPEG pages + pageCount, validates
 * shape (Zod/pure), runs the budget seam (1.7), creates a queued
 * parse_jobs row, enqueues the parse job (producer-only — the LLM is
 * Story 1.4), and returns {jobId} immediately (NFR-P1, no blocking,
 * NO LLM in this thread). NFR-S3/AC5: image bytes are NEVER logged.
 * Node runtime (default).
 */
import {
  type ErrorEnvelope,
  type ParseSubmitResponse,
  validateParseSubmit,
} from "@/features/parsing/schema";
import { checkParseBudget } from "@/features/parsing/server/budget";
import {
  createQueuedJob,
  markJobFailed,
} from "@/features/parsing/server/jobs";
import { enqueueParse } from "@/features/parsing/server/queue";

function err(code: string, message: string, status: number): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ linkId: string }> },
): Promise<Response> {
  const { linkId } = await ctx.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("BAD_FORM", "上傳內容無法讀取，請重試。", 400);
  }

  const files = form.getAll("pages").filter((p): p is File => p instanceof File);
  const pageCount = Number(form.get("pageCount"));

  const shape = validateParseSubmit({
    pageCount,
    mimeTypes: files.map((f) => f.type),
  });
  if (!shape.ok) return err(shape.code, shape.message, 400);

  // Story 1.7 seam (default pass at 1.3).
  const budget = checkParseBudget(linkId);
  if (!budget.ok) return err("BUDGET", budget.message, 429);

  // Encode masked pages → base64 (single-Postgres design; bytes never
  // logged — AC5/NFR-S3).
  let images: string[];
  try {
    images = await Promise.all(
      files.map(async (f) =>
        Buffer.from(await f.arrayBuffer()).toString("base64"),
      ),
    );
  } catch {
    return err("READ_FAIL", "讀取影像失敗，請重試。", 400);
  }

  let jobId: string;
  try {
    jobId = await createQueuedJob(linkId);
  } catch {
    return err("JOB_CREATE_FAILED", "暫時無法處理，請稍後再試。", 502);
  }

  try {
    await enqueueParse({
      sessionId: linkId,
      jobId,
      pageCount,
      images,
      mimeTypes: files.map((f) => f.type),
    });
  } catch {
    // Reach a terminal state so the poller never spins forever
    // (NFR-R1/NFR-R2). Friendly message only.
    await markJobFailed(jobId, "系統忙線，請稍後重試。").catch(() => {});
    return err("ENQUEUE_FAILED", "系統忙線，請稍後重試。", 502);
  }

  const body: ParseSubmitResponse = { jobId };
  return Response.json(body, { status: 202 });
}
