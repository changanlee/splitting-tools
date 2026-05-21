/**
 * POST /api/splits — create a split session (id == linkId). Story 1.3.
 * The unguessable-link scheme is Story 3.1 (not pre-empted here).
 * Node runtime (default); not cached (POST never is).
 *
 * The request body may carry `{ deviceToken }` — the payer's device
 * token. Its sha256 is stored as the session's creator hash so the
 * payer is later recognised as the owner (Feature B pre-allocation).
 */
import { createSession } from "@/features/parsing/server/jobs";
import { isValidDeviceToken } from "@/features/identity/deviceToken";
import { hashDeviceToken } from "@/features/identity/server/identityRepo";
import type {
  CreateSessionResponse,
  ErrorEnvelope,
} from "@/features/parsing/schema";

export async function POST(req: Request): Promise<Response> {
  try {
    let creatorTokenHash: string | null = null;
    try {
      const body: unknown = await req.json();
      const token =
        body && typeof body === "object" && "deviceToken" in body
          ? (body as { deviceToken?: unknown }).deviceToken
          : undefined;
      if (isValidDeviceToken(token)) {
        creatorTokenHash = hashDeviceToken(token);
      }
    } catch {
      // No/!JSON body — fine, owner-mode just unavailable for it.
    }
    const linkId = await createSession(creatorTokenHash);
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
