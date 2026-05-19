/**
 * POST /api/splits — create a split session (id == linkId). Story 1.3.
 * The unguessable-link scheme is Story 3.1 (not pre-empted here).
 * Node runtime (default); not cached (POST never is).
 */
import { createSession } from "@/features/parsing/server/jobs";
import type {
  CreateSessionResponse,
  ErrorEnvelope,
} from "@/features/parsing/schema";

export async function POST(): Promise<Response> {
  try {
    const linkId = await createSession();
    const body: CreateSessionResponse = { linkId };
    return Response.json(body, { status: 201 });
  } catch {
    // NFR-R1: never leak the raw error.
    const body: ErrorEnvelope = {
      error: { code: "SESSION_CREATE_FAILED", message: "暫時無法開始，請稍後再試。" },
    };
    return Response.json(body, { status: 502 });
  }
}
