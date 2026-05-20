/**
 * Story 4.1 — device-token client helpers (NFR-S2).
 *
 * The token is generated in the browser with `crypto.getRandomValues`
 * and persisted in `localStorage`. Its SHA-256 hash is what the
 * server stores in `identities.device_token_hash`; the raw token
 * never leaves the device on its way TO the server (it's sent as a
 * header on every claim mutation, and the server re-hashes to
 * compare).
 *
 * Token format: 32 bytes → base64url → 43 chars. Strictly opaque.
 * One token per device per session-scope (architecture L256-258 ties
 * tokens to localStorage; cross-device → cross-token, by design).
 */
export const DEVICE_TOKEN_HEADER = "X-Device-Token";
const STORAGE_KEY = "splitting-tools.device-token";

function bytesToBase64Url(bytes: Uint8Array): string {
  // btoa needs binary string; one char per byte.
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Read the device token from localStorage. Generates a fresh one on
 * first call. Returns null in SSR / non-window contexts (callers
 * should defer to a useEffect or client island).
 */
export function getOrCreateDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = bytesToBase64Url(bytes);
    window.localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // localStorage blocked (private mode etc.) — return null; the
    // caller surfaces a friendly error rather than crashing.
    return null;
  }
}

/** Strict shape guard for inbound tokens (server side). */
export function isValidDeviceToken(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(s);
}
