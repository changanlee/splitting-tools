/**
 * Epic 7 — server-side access gate.
 *
 * `hasValidAccess()` — the caller redeemed an access code that is still
 * enabled. Gates the receipt-upload entry (the LLM-cost action). Claim
 * / review / settle stay open (link-based; friends pay nothing).
 *
 * `isAdmin()` — the caller holds the admin cookie matching ADMIN_SECRET.
 */
import { cookies } from "next/headers";

import { isCodeUsable } from "@/features/access/server/accessCodeRepo";

/** httpOnly cookie holding the redeemed access code. */
export const ACCESS_COOKIE = "splitting_access";
/** httpOnly cookie holding the admin secret. */
export const ADMIN_COOKIE = "splitting_admin";

/** Caller has a redeemed, still-enabled access code. */
export async function hasValidAccess(): Promise<boolean> {
  const code = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!code) return false;
  try {
    return await isCodeUsable(code);
  } catch {
    // DB blip — fail closed (no access) rather than leak free use.
    return false;
  }
}

/**
 * Caller is the admin. Compares the admin cookie to ADMIN_SECRET. When
 * ADMIN_SECRET is unset the admin area is unreachable (fail-closed) —
 * it must be configured in the deploy `.env`.
 */
export async function isAdmin(): Promise<boolean> {
  // Read the cookie BEFORE the env check, unconditionally. ADMIN_SECRET
  // is injected only at runtime (.env) — an env-first early return would
  // skip cookies() at build time, Next would see no Dynamic API call and
  // statically prerender /admin, and the cached logged-out page would
  // never re-read the cookie (login appears to "reset"). cookies() must
  // run on every render path to keep /admin dynamic — same as
  // hasValidAccess() above. Do not reorder.
  const got = (await cookies()).get(ADMIN_COOKIE)?.value;
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return typeof got === "string" && got.length > 0 && got === secret;
}
