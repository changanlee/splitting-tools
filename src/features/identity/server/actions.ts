"use server";

/**
 * Story 4.1/4.2 — identity actions.
 *
 * `pickOrCreateIdentityAction` either binds an EXISTING identity row
 * to the caller's device token (the "是不是你" pick-from-list UX),
 * or creates a new identity with the supplied name. In both cases
 * the action requires the caller to send a valid device token via
 * a hidden form field — only that token (after sha256) is what's
 * persisted. Raw token never leaves the device → server boundary
 * except inside this single request body. The token is NEVER stored
 * raw (NFR-S3 — only its hash, in `identities.device_token_hash`).
 */
import { redirect } from "next/navigation";

import { isValidDeviceToken } from "@/features/identity/deviceToken";
import {
  createIdentity,
  createNamedIdentity,
  findIdentityForToken,
  hashDeviceToken,
  isSessionOwner,
  listIdentities,
  sessionExistsRepo,
} from "@/features/identity/server/identityRepo";
import { isValidLinkId } from "@/lib/linkId";

export interface MyIdentityResult {
  identity: { id: string; name: string } | null;
  /** Feature B — caller's device created this session (the payer). */
  isOwner: boolean;
}

/**
 * Resolve "who am I on this session" given the caller's raw device
 * token + whether the caller is the session owner. Pure read; never
 * mutates. Used by ClaimPageBody from the client — keeping the hashing
 * on the server side avoids the `crypto.subtle` secure-context
 * requirement that breaks identity resolution over plain HTTP on iOS
 * Safari (LAN dev).
 */
export async function resolveMyIdentityAction(
  linkId: string,
  rawToken: string,
): Promise<MyIdentityResult> {
  if (!isValidLinkId(linkId) || !isValidDeviceToken(rawToken)) {
    return { identity: null, isOwner: false };
  }
  try {
    const [match, owner] = await Promise.all([
      findIdentityForToken(linkId, rawToken),
      isSessionOwner(linkId, rawToken),
    ]);
    return {
      identity: match ? { id: match.id, name: match.name } : null,
      isOwner: owner,
    };
  } catch (e) {
    console.error(
      "[resolveMyIdentityAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    return { identity: null, isOwner: false };
  }
}

const FRIENDLY_OWNER_ONLY = "只有發起人可以代為新增認領的人。";

/**
 * Feature B — the session owner adds a named person (a tokenless
 * identity) so they can pre-allocate claims to them. The person's
 * device token binds later when they open the link and pick this name
 * via the "是不是你" picker.
 */
export async function addPersonAction(
  linkId: string,
  formData: FormData,
): Promise<void> {
  if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);
  const rawToken = String(formData.get("deviceToken") ?? "");
  if (!isValidDeviceToken(rawToken)) throw new Error(FRIENDLY_INVALID);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 30) {
    throw new Error(FRIENDLY_INVALID);
  }
  try {
    const sessionOk = await sessionExistsRepo(linkId);
    if (!sessionOk) throw new Error(FRIENDLY_NOT_FOUND);
    const owner = await isSessionOwner(linkId, rawToken);
    if (!owner) throw new Error(FRIENDLY_OWNER_ONLY);
    await createNamedIdentity(linkId, name);
  } catch (e) {
    if (
      e instanceof Error &&
      [FRIENDLY_INVALID, FRIENDLY_NOT_FOUND, FRIENDLY_OWNER_ONLY].includes(
        e.message,
      )
    ) {
      throw e;
    }
    console.error(
      "[addPersonAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  redirect(`/splits/${linkId}/claim`);
}

const FRIENDLY_INVALID = "輸入內容格式不正確，請確認後再試。";
const FRIENDLY_NOT_FOUND = "找不到這個分帳，請重新整理。";
const FRIENDLY_UNEXPECTED = "暫時無法儲存身份，請稍後再試。";

export async function pickOrCreateIdentityAction(
  linkId: string,
  formData: FormData,
): Promise<void> {
  if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);

  const rawToken = String(formData.get("deviceToken") ?? "");
  if (!isValidDeviceToken(rawToken)) throw new Error(FRIENDLY_INVALID);

  const mode = String(formData.get("mode") ?? "");
  // 'pick' → re-bind an existing identity row to this token (the
  //          "I'm 美" path); 'create' → new identity with the name.
  // No third option — anything else is invalid input.
  if (mode !== "pick" && mode !== "create") {
    throw new Error(FRIENDLY_INVALID);
  }

  try {
    const sessionOk = await sessionExistsRepo(linkId);
    if (!sessionOk) throw new Error(FRIENDLY_NOT_FOUND);

    if (mode === "create") {
      const name = String(formData.get("name") ?? "").trim();
      if (name.length < 1 || name.length > 30) {
        throw new Error(FRIENDLY_INVALID);
      }
      // First check whether this token already has an identity on
      // this session — if so, just go through (idempotent click).
      const existing = await findIdentityForToken(linkId, rawToken);
      if (!existing) {
        await createIdentity(linkId, name, rawToken);
      }
    } else {
      // mode === 'pick'
      const identityId = String(formData.get("identityId") ?? "").trim();
      if (identityId === "") throw new Error(FRIENDLY_INVALID);
      // Re-binding semantics: locate the chosen row by id (must
      // belong to this session) and overwrite its device_token_hash
      // to THIS token. Story 4.3 will harden the token-isolation
      // edge cases; for v1 we keep last-write-wins.
      const all = await listIdentities(linkId);
      const target = all.find((i) => i.id === identityId);
      if (!target) throw new Error(FRIENDLY_INVALID);
      const { db } = await import("@/lib/db/client");
      const { identities } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(identities)
        .set({ deviceTokenHash: hashDeviceToken(rawToken) })
        .where(eq(identities.id, target.id));
    }
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === FRIENDLY_INVALID || e.message === FRIENDLY_NOT_FOUND)
    ) {
      throw e;
    }
    console.error(
      "[pickOrCreateIdentityAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }

  redirect(`/splits/${linkId}/claim`);
}
