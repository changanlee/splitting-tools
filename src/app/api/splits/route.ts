/**
 * POST /api/splits — create a split session (id == linkId). Story 1.3.
 * The unguessable-link scheme is Story 3.1 (not pre-empted here).
 * Node runtime (default); not cached (POST never is).
 *
 * The request body may carry `{ deviceToken, ownerName }` — the payer's
 * device token + name. The token's sha256 is stored as the session's
 * creator hash (owner recognition, Feature B); when a name is also
 * given the owner's identity is created up-front so the payer is a
 * claimable participant from the start (no name prompt on the board).
 */
import { createSession } from "@/features/parsing/server/jobs";
import { isValidDeviceToken } from "@/features/identity/deviceToken";
import {
  createIdentity,
  hashDeviceToken,
} from "@/features/identity/server/identityRepo";
import { hasValidAccess } from "@/features/access/server/accessGate";
import type {
  CreateSessionResponse,
  ErrorEnvelope,
} from "@/features/parsing/schema";

export async function POST(req: Request): Promise<Response> {
  // Epic 7 — defense in depth: the home page already gates this, but a
  // direct API hit must also be rejected without a valid access code.
  if (!(await hasValidAccess())) {
    const body: ErrorEnvelope = {
      error: { code: "ACCESS_REQUIRED", message: "需要存取碼才能使用。" },
    };
    return Response.json(body, { status: 403 });
  }
  try {
    let creatorToken: string | null = null;
    let ownerName = "";
    try {
      const body: unknown = await req.json();
      if (body && typeof body === "object") {
        const token = (body as { deviceToken?: unknown }).deviceToken;
        if (isValidDeviceToken(token)) creatorToken = token;
        const name = (body as { ownerName?: unknown }).ownerName;
        if (typeof name === "string") ownerName = name.trim().slice(0, 30);
      }
    } catch {
      // No/!JSON body — fine, owner-mode just unavailable for it.
    }
    const creatorTokenHash = creatorToken
      ? hashDeviceToken(creatorToken)
      : null;
    const linkId = await createSession(creatorTokenHash);
    // Create the owner's identity up-front when a name was supplied.
    if (creatorToken && ownerName.length > 0) {
      try {
        await createIdentity(linkId, ownerName, creatorToken);
      } catch {
        // Non-fatal — the claim board still has the name-prompt
        // fallback if the owner identity wasn't created here.
      }
    }
    const body: CreateSessionResponse = { linkId };
    return Response.json(body, { status: 201 });
  } catch {
    // NFR-R1: never leak the raw error.
    const body: ErrorEnvelope = {
      error: {
        code: "SESSION_CREATE_FAILED",
        message: "暫時無法開始，請稍後再試。",
      },
    };
    return Response.json(body, { status: 502 });
  }
}
