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
import { extractClientIp, sha256IpKey } from "@/lib/rateLimit.server";
import {
  createQueuedJob,
  markJobFailed,
  sessionExists,
} from "@/features/parsing/server/jobs";
import { enqueueParse } from "@/features/parsing/server/queue";
import { hasValidAccess } from "@/features/access/server/accessGate";
import { isValidLinkId } from "@/lib/linkId";

/** Per-file byte cap (masked compressed JPEGs are ~hundreds KB; 8MB is
 *  a generous abuse ceiling that still bounds request memory). */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function err(code: string, message: string, status: number): Response {
  const body: ErrorEnvelope = { error: { code, message } };
  return Response.json(body, { status });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ linkId: string }> },
): Promise<Response> {
  const { linkId } = await ctx.params;

  // Epic 7 — the parse submit is THE LLM-cost trigger; reject without a
  // valid access code (defense in depth behind the home-page gate).
  if (!(await hasValidAccess())) {
    return err("ACCESS_REQUIRED", "需要存取碼才能使用。", 403);
  }

  // Story 3.1 — shape-guard the linkId BEFORE any DB / form work.
  // Closes W-2-1-3 (raw URL segments hitting Drizzle and being
  // swallowed as generic friendly errors).
  if (!isValidLinkId(linkId)) {
    return err("NO_SESSION", "找不到這個分帳，請重新開始。", 404);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return err("BAD_FORM", "上傳內容無法讀取，請重試。", 400);
  }

  const files = form
    .getAll("pages")
    .filter((p): p is File => p instanceof File);
  // Parse pageCount ONCE into a validated integer; the SAME value is
  // used for validation and the enqueued payload (no coercion drift).
  const rawPageCount = form.get("pageCount");
  const pageCount =
    typeof rawPageCount === "string" && rawPageCount.trim() !== ""
      ? Number(rawPageCount)
      : NaN;

  const shape = validateParseSubmit({
    pageCount,
    mimeTypes: files.map((f) => f.type),
  });
  if (!shape.ok) return err(shape.code, shape.message, 400);

  // Reject empty / oversized parts BEFORE reading bytes into memory
  // (bounded request memory; size is known without reading the blob).
  for (const f of files) {
    if (f.size === 0) {
      return err("EMPTY_IMAGE", "有一頁影像是空的，請重拍。", 400);
    }
    if (f.size > MAX_IMAGE_BYTES) {
      return err("IMAGE_TOO_LARGE", "影像檔過大，請重拍一次。", 413);
    }
  }

  // Story 1.7: per-session AND per-IP daily page-budget enforcement
  // (FR46 / NFR-S7 / NFR-L5). Counted by `pageCount` — already
  // validated to be 1..MAX_PARSE_PAGES upstream — so a deny here
  // means the client already passed shape/size checks. IP is hashed
  // (NFR-S3 privacy; raw IP never persisted). 429 carries Retry-After.
  const ipKey = sha256IpKey(extractClientIp(request.headers));
  const budget = await checkParseBudget({
    sessionId: linkId,
    ipKey,
    pages: pageCount,
  });
  if (!budget.ok) {
    const body: ErrorEnvelope = {
      error: { code: "BUDGET", message: budget.message },
    };
    return Response.json(body, {
      status: 429,
      headers: { "Retry-After": String(budget.retryAfterSeconds) },
    });
  }

  // Session must exist (404, not an FK-violation-as-502). Full link
  // semantics = Story 3.1; device-token authz = Epic 4.
  let exists: boolean;
  try {
    exists = await sessionExists(linkId);
  } catch {
    return err("LOOKUP_FAILED", "暫時無法處理，請稍後再試。", 502);
  }
  if (!exists) return err("NO_SESSION", "找不到這個分帳，請重新開始。", 404);

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
    // (NFR-R1/NFR-R2). Friendly message only. If THIS also fails, log
    // it (never silent-swallow) — the poller's safety cap is the
    // backstop so the payer is still never deadlocked.
    await markJobFailed(jobId, "系統忙線，請稍後重試。").catch((e) =>
      console.error("[parse-submit] markJobFailed failed:", e),
    );
    return err("ENQUEUE_FAILED", "系統忙線，請稍後重試。", 502);
  }

  const body: ParseSubmitResponse = { jobId };
  return Response.json(body, { status: 202 });
}
