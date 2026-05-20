"use server";

/**
 * Story 5.4 — finalize the session (payer absorbs pending). Sets
 * sessions.status='finalized'; the freeze gate (Story 5.5) checks
 * this string anywhere a write happens so the payer can't keep
 * editing after distributing the result. Reverse action also
 * exposed so the payer can recover from an accidental finalize.
 */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db/client";
import { sessions } from "@/db/schema";
import { sessionExistsRepo } from "@/features/identity/server/identityRepo";
import { isValidLinkId } from "@/lib/linkId";

const FRIENDLY_INVALID = "輸入內容格式不正確，請確認後再試。";
const FRIENDLY_NOT_FOUND = "找不到這個分帳，請重新整理。";
const FRIENDLY_UNEXPECTED = "暫時無法儲存變更，請稍後再試。";

export async function finalizeSessionAction(
  linkId: string,
  formData: FormData,
): Promise<void> {
  if (!isValidLinkId(linkId)) throw new Error(FRIENDLY_NOT_FOUND);

  const confirmed = String(formData.get("confirmed") ?? "");
  let nextStatus: string;
  if (confirmed === "yes") {
    nextStatus = "finalized";
  } else if (confirmed === "undo") {
    nextStatus = "draft";
  } else {
    throw new Error(FRIENDLY_INVALID);
  }

  try {
    const ok = await sessionExistsRepo(linkId);
    if (!ok) throw new Error(FRIENDLY_NOT_FOUND);
    await db
      .update(sessions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(sessions.id, linkId));
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message === FRIENDLY_INVALID || e.message === FRIENDLY_NOT_FOUND)
    ) {
      throw e;
    }
    console.error(
      "[finalizeSessionAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error(FRIENDLY_UNEXPECTED);
  }
  revalidatePath(`/splits/${linkId}/settle`);
  revalidatePath(`/splits/${linkId}/review`);
  revalidatePath(`/splits/${linkId}/claim`);
}
