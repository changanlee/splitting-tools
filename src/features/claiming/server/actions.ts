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
import { claims, receiptLines } from "@/db/schema";
import {
  findIdentityForToken,
  isSessionOwner,
  listIdentities,
  sessionExistsRepo,
  type Identity,
} from "@/features/identity/server/identityRepo";
import { isValidDeviceToken } from "@/features/identity/deviceToken";
import {
  lineBelongsToSession,
  toggleClaim,
} from "@/features/claiming/server/claimRepo";
import {
  appendChange,
  latestChangeForIdentity,
} from "@/features/claiming/server/changeLog";
import {
  FRIENDLY_FROZEN,
  isFrozen,
} from "@/features/settlement/freeze";
import { sessions } from "@/db/schema";
import { isValidLinkId } from "@/lib/linkId";

const FRIENDLY_INVALID = "輸入內容格式不正確，請確認後再試。";
const FRIENDLY_AUTH = "請先選擇你的身份再認領（4.1 認領入口）。";
const FRIENDLY_NOT_FOUND = "找不到這個分帳或品項，請重新整理。";
const FRIENDLY_UNEXPECTED = "暫時無法儲存認領，請稍後再試。";
const FRIENDLY_OWNER_ONLY = "只有發起人可以設定份數。";

/**
 * Feature B — the session owner sets how many shares a line splits
 * into, directly from the claim board. The receipt prints a multipack
 * as "1x" so OCR can never know; only the payer can. Owner-only;
 * share_count does not affect net_cents (it is purely the claim
 * divisor), so no IRC re-fold is needed.
 */
export async function setShareCountAction(
  linkId: string,
  receiptLineId: string,
  formData: FormData,
): Promise<void> {
  const rawToken = String(formData.get("deviceToken") ?? "");
  const raw = String(formData.get("shareCount") ?? "");
  const shareCount = Number.parseInt(raw, 10);
  if (!Number.isInteger(shareCount) || shareCount < 1 || shareCount > 99) {
    throw new Error(FRIENDLY_INVALID);
  }
  try {
    if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);
    if (!isValidDeviceToken(rawToken)) throw new Error(FRIENDLY_INVALID);
    const statusRows = await db
      .select({ status: sessions.status })
      .from(sessions)
      .where(eq(sessions.id, linkId))
      .limit(1);
    if (!statusRows[0]) throw new Error(FRIENDLY_NOT_FOUND);
    if (isFrozen(statusRows[0].status)) throw new Error(FRIENDLY_FROZEN);
    const owner = await isSessionOwner(linkId, rawToken);
    if (!owner) throw new Error(FRIENDLY_OWNER_ONLY);
    await db
      .update(receiptLines)
      .set({ shareCount })
      .where(
        and(
          eq(receiptLines.id, receiptLineId),
          eq(receiptLines.sessionId, linkId),
        ),
      );
  } catch (e) {
    if (
      e instanceof Error &&
      [
        FRIENDLY_INVALID,
        FRIENDLY_NOT_FOUND,
        FRIENDLY_FROZEN,
        FRIENDLY_OWNER_ONLY,
      ].includes(e.message)
    ) {
      throw e;
    }
    console.error(
      "[setShareCountAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/claim`);
}

/**
 * Resolve which identity a claim write applies to.
 *
 * Feature B authz: when `targetIdentityId` is given, the caller must
 * be the session OWNER to act on someone else (pre-allocation) — the
 * owner may write any identity's claims. A non-owner may only ever
 * write their own identity. With no `targetIdentityId` the action is
 * the classic self-service path (caller's own device-bound identity).
 */
async function resolveActingIdentity(
  linkId: string,
  rawToken: string,
  targetIdentityId?: string,
): Promise<Identity> {
  if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);
  if (!isValidDeviceToken(rawToken)) throw new Error(FRIENDLY_INVALID);
  const sessionOk = await sessionExistsRepo(linkId);
  if (!sessionOk) throw new Error(FRIENDLY_NOT_FOUND);
  // Story 5.5 — refuse any claim write once the session is frozen.
  const statusRows = await db
    .select({ status: sessions.status })
    .from(sessions)
    .where(eq(sessions.id, linkId))
    .limit(1);
  if (statusRows[0] && isFrozen(statusRows[0].status)) {
    throw new Error(FRIENDLY_FROZEN);
  }

  const own = await findIdentityForToken(linkId, rawToken);

  if (targetIdentityId && targetIdentityId.length > 0) {
    // Acting on a specific identity: allowed if it IS the caller's own
    // identity, OR the caller is the session owner (pre-allocation).
    if (own && own.id === targetIdentityId) return own;
    const owner = await isSessionOwner(linkId, rawToken);
    if (!owner) throw new Error(FRIENDLY_AUTH);
    const target = (await listIdentities(linkId)).find(
      (i) => i.id === targetIdentityId,
    );
    if (!target) throw new Error(FRIENDLY_NOT_FOUND);
    return target;
  }

  // Self-service path — caller's own device-bound identity.
  if (!own) throw new Error(FRIENDLY_AUTH);
  return own;
}

export async function toggleClaimAction(
  linkId: string,
  receiptLineId: string,
  formData: FormData,
): Promise<void> {
  const rawToken = String(formData.get("deviceToken") ?? "");
  const targetIdentityId = String(formData.get("targetIdentityId") ?? "");
  try {
    const identity = await resolveActingIdentity(
      linkId,
      rawToken,
      targetIdentityId,
    );
    const lineOk = await lineBelongsToSession(linkId, receiptLineId);
    if (!lineOk) throw new Error(FRIENDLY_NOT_FOUND);

    const { claimed } = await toggleClaim({
      sessionId: linkId,
      receiptLineId,
      identityId: identity.id,
    });
    await appendChange({
      sessionId: linkId,
      receiptLineId,
      identityId: identity.id,
      action: claimed ? "claim" : "unclaim",
    });
  } catch (e) {
    if (
      e instanceof Error &&
      [FRIENDLY_INVALID, FRIENDLY_AUTH, FRIENDLY_NOT_FOUND, FRIENDLY_FROZEN].includes(e.message)
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
  const targetIdentityId = String(formData.get("targetIdentityId") ?? "");
  const raw = String(formData.get("weight") ?? "");
  const weight = Number.parseInt(raw, 10);
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
    throw new Error(FRIENDLY_INVALID);
  }
  try {
    const identity = await resolveActingIdentity(
      linkId,
      rawToken,
      targetIdentityId,
    );
    await db
      .update(claims)
      .set({ weight })
      .where(
        and(
          eq(claims.receiptLineId, receiptLineId),
          eq(claims.identityId, identity.id),
        ),
      );
    await appendChange({
      sessionId: linkId,
      receiptLineId,
      identityId: identity.id,
      action: "weight",
      details: { weight },
    });
  } catch (e) {
    if (
      e instanceof Error &&
      [FRIENDLY_INVALID, FRIENDLY_AUTH, FRIENDLY_NOT_FOUND, FRIENDLY_FROZEN].includes(e.message)
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

/**
 * Story 4.6 — undo my last claim action (toggle or weight).
 * Reads the latest claim_changes row for (session, identity), reverses
 * it, and appends a fresh 'undo' record so a second undo can no-op.
 */
export async function undoLastClaimAction(
  linkId: string,
  formData: FormData,
): Promise<void> {
  const rawToken = String(formData.get("deviceToken") ?? "");
  const targetIdentityId = String(formData.get("targetIdentityId") ?? "");
  try {
    const identity = await resolveActingIdentity(
      linkId,
      rawToken,
      targetIdentityId,
    );
    const latest = await latestChangeForIdentity(linkId, identity.id);
    if (!latest) {
      throw new Error("沒有可撤銷的動作。");
    }
    if (latest.action === "claim" && latest.receiptLineId) {
      // Reverse a claim → unclaim.
      const { toggleClaim } = await import(
        "@/features/claiming/server/claimRepo"
      );
      await toggleClaim({
        sessionId: linkId,
        receiptLineId: latest.receiptLineId,
        identityId: identity.id,
      });
    } else if (latest.action === "unclaim" && latest.receiptLineId) {
      // Reverse an unclaim → re-claim.
      const { toggleClaim } = await import(
        "@/features/claiming/server/claimRepo"
      );
      await toggleClaim({
        sessionId: linkId,
        receiptLineId: latest.receiptLineId,
        identityId: identity.id,
      });
    } else if (
      latest.action === "weight" &&
      latest.receiptLineId &&
      latest.details
    ) {
      // Restore previous weight. v1: details only stores the NEW
      // weight; without the prior value we honestly can't restore
      // the exact prior. Fall back to weight=1 as the safe default
      // and document via the change log entry. Story 4.9 hardening
      // (store prior weight in details) → W-4-9-1.
      await db
        .update(claims)
        .set({ weight: 1 })
        .where(
          and(
            eq(claims.receiptLineId, latest.receiptLineId),
            eq(claims.identityId, identity.id),
          ),
        );
    } else {
      throw new Error("沒有可撤銷的動作。");
    }
    await appendChange({
      sessionId: linkId,
      receiptLineId: latest.receiptLineId,
      identityId: identity.id,
      action: "undo",
      details: { reversed: latest.action, sourceId: latest.id },
    });
  } catch (e) {
    if (
      e instanceof Error &&
      [
        FRIENDLY_INVALID,
        FRIENDLY_AUTH,
        FRIENDLY_NOT_FOUND,
        "沒有可撤銷的動作。",
      ].includes(e.message)
    ) {
      throw e;
    }
    console.error(
      "[undoLastClaimAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/claim`);
}
