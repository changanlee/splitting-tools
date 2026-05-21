/**
 * Story 4.1/4.2 — server-side identity repo.
 * Hashes the raw device token to sha256 (NFR-S3 — raw never persisted).
 */
import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { identities, sessions } from "@/db/schema";

export function hashDeviceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export interface Identity {
  id: string;
  sessionId: string;
  name: string;
  /** Null = an owner-pre-created identity not yet bound to a device. */
  deviceTokenHash: string | null;
}

export async function listIdentities(sessionId: string): Promise<Identity[]> {
  return db
    .select({
      id: identities.id,
      sessionId: identities.sessionId,
      name: identities.name,
      deviceTokenHash: identities.deviceTokenHash,
    })
    .from(identities)
    .where(eq(identities.sessionId, sessionId));
}

/**
 * Find an identity by (session, device-token). Returns null if no
 * identity has been bound for this token yet on this session.
 */
export async function findIdentityForToken(
  sessionId: string,
  rawToken: string,
): Promise<Identity | null> {
  const tokenHash = hashDeviceToken(rawToken);
  const rows = await db
    .select({
      id: identities.id,
      sessionId: identities.sessionId,
      name: identities.name,
      deviceTokenHash: identities.deviceTokenHash,
    })
    .from(identities)
    .where(
      and(
        eq(identities.sessionId, sessionId),
        eq(identities.deviceTokenHash, tokenHash),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create a new identity bound to the given device-token. Caller must
 * have already verified the session exists.
 */
export async function createIdentity(
  sessionId: string,
  name: string,
  rawToken: string,
): Promise<Identity> {
  const id = randomUUID();
  const deviceTokenHash = hashDeviceToken(rawToken);
  await db.insert(identities).values({
    id,
    sessionId,
    name,
    deviceTokenHash,
  });
  return { id, sessionId, name, deviceTokenHash };
}

/**
 * Create a NAMED identity with no device token (Feature B) — the
 * session owner pre-allocates for a person who hasn't joined. The
 * device token is bound later when that person opens the link and
 * picks this name via the "是不是你" picker.
 */
export async function createNamedIdentity(
  sessionId: string,
  name: string,
): Promise<Identity> {
  const id = randomUUID();
  await db.insert(identities).values({
    id,
    sessionId,
    name,
    deviceTokenHash: null,
  });
  return { id, sessionId, name, deviceTokenHash: null };
}

/**
 * Feature B — is the caller's device the session creator (the payer)?
 * The owner may mutate any identity's claims; members only their own.
 * False when the session has no recorded creator (legacy / unknown).
 */
export async function isSessionOwner(
  sessionId: string,
  rawToken: string,
): Promise<boolean> {
  const rows = await db
    .select({ creatorTokenHash: sessions.creatorTokenHash })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const creatorHash = rows[0]?.creatorTokenHash;
  if (!creatorHash) return false;
  return hashDeviceToken(rawToken) === creatorHash;
}

export async function sessionExistsRepo(sessionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return rows.length > 0;
}
