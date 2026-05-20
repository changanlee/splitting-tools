"use server";

/**
 * Story 4.4/4.5/4.6 — claim toggle / weight set / undo (last toggle).
 * Identity is resolved server-side from the device-token sent in the
 * form payload (sha256 against identities.device_token_hash). This
 * is the cross-cutting authz contract (Architecture L432): every
 * claim-writing endpoint MUST verify the token owns the identity.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { claims } from "@/db/schema";
import {
  findIdentityForToken,
  sessionExistsRepo,
} from "@/features/identity/server/identityRepo";
import { isValidDeviceToken } from "@/features/identity/deviceToken";
import {
  lineBelongsToSession,
  toggleClaim,
} from "@/features/claiming/server/claimRepo";
import { isValidLinkId } from "@/lib/linkId";

const FRIENDLY_INVALID = "輸入內容格式不正確，請確認後再試。";
const FRIENDLY_AUTH = "請先選擇你的身份再認領（4.1 認領入口）。";
const FRIENDLY_NOT_FOUND = "找不到這個分帳或品項，請重新整理。";
const FRIENDLY_UNEXPECTED = "暫時無法儲存認領，請稍後再試。";

async function resolveIdentity(linkId: string, rawToken: string) {
  if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);
  if (!isValidDeviceToken(rawToken)) throw new Error(FRIENDLY_INVALID);
  const sessionOk = await sessionExistsRepo(linkId);
  if (!sessionOk) throw new Error(FRIENDLY_NOT_FOUND);
  const identity = await findIdentityForToken(linkId, rawToken);
  if (!identity) throw new Error(FRIENDLY_AUTH);
  return identity;
}

export async function toggleClaimAction(
  linkId: string,
  receiptLineId: string,
  formData: FormData,
): Promise<void> {
  const rawToken = String(formData.get("deviceToken") ?? "");
  try {
    const identity = await resolveIdentity(linkId, rawToken);
    const lineOk = await lineBelongsToSession(linkId, receiptLineId);
    if (!lineOk) throw new Error(FRIENDLY_NOT_FOUND);

    await toggleClaim({
      sessionId: linkId,
      receiptLineId,
      identityId: identity.id,
    });
  } catch (e) {
    if (
      e instanceof Error &&
      [FRIENDLY_INVALID, FRIENDLY_AUTH, FRIENDLY_NOT_FOUND].includes(e.message)
    ) {
      throw e;
    }
    console.error(
      "[toggleClaimAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/claim`);
}

export async function setClaimWeightAction(
  linkId: string,
  receiptLineId: string,
  formData: FormData,
): Promise<void> {
  const rawToken = String(formData.get("deviceToken") ?? "");
  const raw = String(formData.get("weight") ?? "");
  const weight = Number.parseInt(raw, 10);
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
    throw new Error(FRIENDLY_INVALID);
  }
  try {
    const identity = await resolveIdentity(linkId, rawToken);
    await db
      .update(claims)
      .set({ weight })
      .where(
        and(
          eq(claims.receiptLineId, receiptLineId),
          eq(claims.identityId, identity.id),
        ),
      );
  } catch (e) {
    if (
      e instanceof Error &&
      [FRIENDLY_INVALID, FRIENDLY_AUTH, FRIENDLY_NOT_FOUND].includes(e.message)
    ) {
      throw e;
    }
    console.error(
      "[setClaimWeightAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/claim`);
}
