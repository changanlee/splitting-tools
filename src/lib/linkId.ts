/**
 * Story 3.1 — unguessable share-link ID (FR17 / NFR-S1).
 *
 * 16 bytes of crypto-random → base64url → 22 chars, ≥128-bit entropy.
 * Architecture L256-258 explicitly rejects UUIDv4 (only 122 bits) —
 * 16 bytes from crypto.randomBytes gives 128 bits, which is the
 * design floor. The link IS the access token (NFR-S1).
 */
import { randomBytes } from "node:crypto";

/** Produce a new unguessable link id. */
export function generateLinkId(): string {
  // 16 raw bytes -> 24-char base64 (+padding). base64url with
  // padding stripped is 22 chars.
  return randomBytes(16).toString("base64url");
}

/**
 * Strict shape check for incoming linkIds (routes / actions / pages).
 * - 22 chars (no padding), URL-safe base64 alphabet
 * - rejects empty, oversized, or characters outside [A-Za-z0-9_-]
 *
 * Use this as the FIRST guard in any route handler that takes a
 * linkId — closes W-2-1-3 (the 2.1 review noted that an unguarded
 * linkId hits Drizzle with junk and the error gets swallowed as a
 * generic "暫時無法..." which is indistinguishable from a real
 * outage). With the shape guard, an obviously-malformed link → 404
 * instead.
 */
export function isValidLinkId(s: unknown): s is string {
  if (typeof s !== "string") return false;
  return /^[A-Za-z0-9_-]{22}$/.test(s);
}
