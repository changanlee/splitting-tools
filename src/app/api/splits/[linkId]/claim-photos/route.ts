/**
 * POST /api/splits/[linkId]/claim-photos — Story 8.1 (photo-assisted claim).
 *
 * A claimer photographs the physical products they took. We shape-validate
 * the upload (reusing the parse submit guard), authorize via device-token
 * (must be a bound identity in THIS session — same authz contract as the
 * other claim writes), bound LLM cost via the existing parse budget seam,
 * then enqueue a `match` job and return immediately (NFR-P1; NO LLM in this
 * thread — the vision call is matchWorker → matchProductsAdapter, NFR-L4).
 * Fire-and-forget: the worker seeds preliminary claims; the board reflects
 * them on its next render. Image bytes are NEVER logged (NFR-S3).
 */
import {
  type ErrorEnvelope,
  validateParseSubmit,
} from "@/features/parsing/schema";
import { checkParseBudget } from "@/features/parsing/server/budget";
import { sessionExists } from "@/features/parsing/server/jobs";
import { enqueueMatch } from "@/features/claiming/server/matchQueue";
import { findIdentityForToken } from "@/features/identity/server/identityRepo";
import { isValidDeviceToken } from "@/features/identity/deviceToken";
import { FRIENDLY_FROZEN, isFrozen } from "@/features/settlement/freeze";
import { db } from "@/lib/db/client";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extractClientIp, sha256IpKey } from "@/lib/rateLimit.server";
import { isValidLinkId } from "@/lib/linkId";

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
  const rawPageCount = form.get("pageCount");
  const pageCount =
    typeof rawPageCount === "string" && rawPageCount.trim() !== ""
      ? Number(rawPageCount)
      : files.length;

  const shape = validateParseSubmit({
    pageCount,
    mimeTypes: files.map((f) => f.type),
  });
  if (!shape.ok) return err(shape.code, shape.message, 400);

  for (const f of files) {
    if (f.size === 0) return err("EMPTY_IMAGE", "有一張照片是空的，請重拍。", 400);
    if (f.size > MAX_IMAGE_BYTES) {
      return err("IMAGE_TOO_LARGE", "照片檔過大，請重拍一次。", 413);
    }
  }

  // Device-token authz: only a bound identity in THIS session may trigger
  // a (paid) match for itself — same contract as the other claim writes.
  const rawToken = String(form.get("deviceToken") ?? "");
  if (!isValidDeviceToken(rawToken)) {
    return err("AUTH", "請先選擇你的身份再使用拍照認領。", 401);
  }

  let exists: boolean;
  try {
    exists = await sessionExists(linkId);
  } catch {
    return err("LOOKUP_FAILED", "暫時無法處理，請稍後再試。", 502);
  }
  if (!exists) return err("NO_SESSION", "找不到這個分帳，請重新開始。", 404);

  const identity = await findIdentityForToken(linkId, rawToken);
  if (!identity) {
    return err("AUTH", "請先選擇你的身份再使用拍照認領。", 401);
  }

  // Story 5.5 — refuse once the session is finalized (read-only). Mirrors
  // the freeze guard on every other claim write; the worker re-checks too.
  const statusRows = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  if (statusRows[0] && isFrozen(statusRows[0].status)) {
    return err("FROZEN", FRIENDLY_FROZEN, 409);
  }

  // Bound LLM cost via the existing per-session/IP daily image budget.
  const ipKey = sha256IpKey(extractClientIp(request.headers));
  const budget = await checkParseBudget({ sessionId: linkId, ipKey, pages: pageCount });
  if (!budget.ok) {
    const body: ErrorEnvelope = { error: { code: "BUDGET", message: budget.message } };
    return Response.json(body, {
      status: 429,
      headers: { "Retry-After": String(budget.retryAfterSeconds) },
    });
  }

  let images: string[];
  try {
    images = await Promise.all(
      files.map(async (f) =>
        Buffer.from(await f.arrayBuffer()).toString("base64"),
      ),
    );
  } catch {
    return err("READ_FAIL", "讀取照片失敗，請重試。", 400);
  }

  try {
    await enqueueMatch({
      sessionId: linkId,
      identityId: identity.id,
      images,
      mimeTypes: files.map((f) => f.type),
    });
  } catch {
    return err("ENQUEUE_FAILED", "系統忙線，請稍後重試。", 502);
  }

  // Fire-and-forget: no job-status table in v1. The board shows the
  // seeded claims on refresh once the worker finishes.
  return Response.json({ queued: true }, { status: 202 });
}
