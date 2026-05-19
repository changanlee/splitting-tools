/**
 * GET /api/splits/[linkId]/parse-jobs/[jobId] — Story 1.3 (AC2/AC3).
 *
 * Read-only O(1) job status, scoped to the link. `message` is ALWAYS
 * friendly (NFR-R1: raw LLM/stack errors never leave the server).
 * Node runtime; not cached (status is request-time data).
 */
import {
  type ErrorEnvelope,
  type ParseStatusResponse,
  ParseJobStatusSchema,
  friendlyJobMessage,
} from "@/features/parsing/schema";
import { getJobStatus } from "@/features/parsing/server/jobs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ linkId: string; jobId: string }> },
): Promise<Response> {
  const { linkId, jobId } = await ctx.params;

  let row: { status: string; error: string | null } | null;
  try {
    row = await getJobStatus(jobId, linkId);
  } catch {
    const body: ErrorEnvelope = {
      error: { code: "STATUS_READ_FAILED", message: "暫時無法取得進度，請稍後再試。" },
    };
    return Response.json(body, { status: 502 });
  }

  if (!row) {
    const body: ErrorEnvelope = {
      error: { code: "NOT_FOUND", message: "找不到這筆解析工作。" },
    };
    return Response.json(body, { status: 404 });
  }

  // Defensive: the DB column is free-text (W-CR-3). Validate before
  // trusting it; an unexpected value degrades to "failed" (never spin).
  const parsed = ParseJobStatusSchema.safeParse(row.status);
  if (!parsed.success) {
    // Free-text column (W-CR-3): an unknown value is a contract bug.
    // Log it (observability) and fail CLOSED so the poller terminates
    // (NFR-R2 never-deadlock) rather than spinning on an unknown.
    console.warn(
      `[parse-status] unexpected status "${row.status}" for job ${jobId}`,
    );
  }
  const status = parsed.success ? parsed.data : "failed";

  const body: ParseStatusResponse = {
    status,
    message: friendlyJobMessage(status, row.error),
  };
  return Response.json(body);
}
