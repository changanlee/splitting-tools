/**
 * Epic 7 — access-code persistence. The owner sells access off-platform
 * and issues a code per paying user; `enabled` is the admin on/off
 * switch checked on every gated request.
 */
import { randomBytes } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { accessCodes } from "@/db/schema";

export interface AccessCode {
  code: string;
  label: string;
  enabled: boolean;
  createdAt: Date;
}

/** Short, opaque, type-once code — base64url of 7 random bytes (~10 chars). */
export function generateCode(): string {
  return randomBytes(7).toString("base64url");
}

/** Strict shape guard for an inbound code string. */
export function isValidCodeShape(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(s);
}

export async function createAccessCode(label: string): Promise<AccessCode> {
  const code = generateCode();
  const row = {
    code,
    label: label.slice(0, 60),
    enabled: true,
    createdAt: new Date(),
  };
  await db.insert(accessCodes).values(row);
  return row;
}

export async function listAccessCodes(): Promise<AccessCode[]> {
  return db
    .select()
    .from(accessCodes)
    .orderBy(desc(accessCodes.createdAt));
}

export async function setAccessCodeEnabled(
  code: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(accessCodes)
    .set({ enabled })
    .where(eq(accessCodes.code, code));
}

/**
 * Permanently remove a code — list cleanup. Any holder of it immediately
 * loses access (isCodeUsable then fails the existence check). To revoke
 * while keeping the record of who had it, use setAccessCodeEnabled(false)
 * instead.
 */
export async function deleteAccessCode(code: string): Promise<void> {
  await db.delete(accessCodes).where(eq(accessCodes.code, code));
}

/**
 * Is this code currently usable? True only if it exists AND is enabled —
 * a revoked (disabled) code fails here even if the caller still holds
 * the cookie, so revocation takes effect immediately.
 */
export async function isCodeUsable(code: string): Promise<boolean> {
  if (!isValidCodeShape(code)) return false;
  const rows = await db
    .select({ enabled: accessCodes.enabled })
    .from(accessCodes)
    .where(eq(accessCodes.code, code))
    .limit(1);
  return rows[0]?.enabled === true;
}
