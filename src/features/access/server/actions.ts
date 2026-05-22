"use server";

/**
 * Epic 7 — access-code + admin server actions.
 *
 * Redeem: a paying user enters their code → cookie set → upload entry
 * unlocked. Admin: a secret unlocks /admin, where codes are created and
 * enabled/disabled. Payment is off-platform — the app never touches it.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ACCESS_COOKIE,
  ADMIN_COOKIE,
  isAdmin,
} from "@/features/access/server/accessGate";
import {
  createAccessCode,
  isCodeUsable,
  isValidCodeShape,
  setAccessCodeEnabled,
} from "@/features/access/server/accessCodeRepo";

const FRIENDLY_BAD_CODE = "存取碼無效或已停用，請確認後再試。";
const FRIENDLY_ADMIN = "管理密鑰錯誤。";
const FRIENDLY_INVALID = "輸入內容格式不正確。";

// 180 days — redeemed once, the cookie keeps the user in until the
// admin disables the code (re-checked from the DB on every request).
const COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

/** Cookie options. `secure:false` so it also works over plain-HTTP LAN
 *  testing; in production everything is HTTPS behind Caddy anyway. */
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: false,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

/** Redeem an access code — the paying user's unlock. */
export async function redeemAccessCodeAction(
  formData: FormData,
): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  if (!isValidCodeShape(code)) throw new Error(FRIENDLY_BAD_CODE);
  let ok = false;
  try {
    ok = await isCodeUsable(code);
  } catch (e) {
    console.error(
      "[redeemAccessCodeAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error("暫時無法驗證存取碼，請稍後再試。");
  }
  if (!ok) throw new Error(FRIENDLY_BAD_CODE);
  (await cookies()).set(ACCESS_COOKIE, code, COOKIE_OPTS);
  redirect("/");
}

/** Admin login — exchange the admin secret for the admin cookie. */
export async function adminLoginAction(formData: FormData): Promise<void> {
  const secret = String(formData.get("secret") ?? "");
  const expected = process.env.ADMIN_SECRET;
  if (!expected || secret !== expected) throw new Error(FRIENDLY_ADMIN);
  (await cookies()).set(ADMIN_COOKIE, secret, COOKIE_OPTS);
  redirect("/admin");
}

/** Admin: issue a new access code for a labelled person. */
export async function createAccessCodeAction(
  formData: FormData,
): Promise<void> {
  if (!(await isAdmin())) throw new Error(FRIENDLY_ADMIN);
  const label = String(formData.get("label") ?? "").trim();
  if (label.length > 60) throw new Error(FRIENDLY_INVALID);
  try {
    await createAccessCode(label);
  } catch (e) {
    console.error(
      "[createAccessCodeAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error("暫時無法新增存取碼，請稍後再試。");
  }
  redirect("/admin");
}

/** Admin: enable / disable a code (the on/off switch for paid access). */
export async function toggleAccessCodeAction(
  formData: FormData,
): Promise<void> {
  if (!(await isAdmin())) throw new Error(FRIENDLY_ADMIN);
  const code = String(formData.get("code") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isValidCodeShape(code)) throw new Error(FRIENDLY_INVALID);
  try {
    await setAccessCodeEnabled(code, enabled);
  } catch (e) {
    console.error(
      "[toggleAccessCodeAction] failed:",
      e instanceof Error ? e.message : String(e),
    );
    throw new Error("暫時無法更新存取碼，請稍後再試。");
  }
  redirect("/admin");
}
