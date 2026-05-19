/**
 * Pure multi-page list logic — NO DOM, fully node-testable (AC7).
 *
 * Story 1.2b multi-page capture. Mirrors the geometry.ts pure-fn pattern:
 * all list maths lives here so the canvas/pointer glue (CaptureFlow /
 * PageList) never needs a browser env to be tested.
 *
 * Every export is a pure function EXCEPT {@link nextPageId} — the one
 * intentional impurity (a monotonic id factory). It is kept here so id
 * generation stays out of the DOM glue; its only effect is an internal
 * counter and `Date.now()`, and it is exercised by the test for
 * uniqueness, not purity.
 */

export interface Page {
  /**
   * Stable unique id. Deliberately NOT `crypto.randomUUID()` — that needs
   * a secure context and LAN dev runs over plain http (would throw).
   * Use {@link nextPageId}.
   */
  id: string;
  /** Best-effort content signature for dedupe (NOT cryptographic). */
  signature: string;
  /**
   * Per-page mask/skip decision satisfied. True by construction: a page
   * only enters the list after confirm (AC5 decided-by-construction).
   */
  decided: boolean;
}

let _seq = 0;

/** Monotonic, secure-context-free unique id (LAN http safe). */
export function nextPageId(): string {
  _seq += 1;
  return `p${Date.now().toString(36)}-${_seq}`;
}

/** Append a page. Pure — returns a new array, input untouched (AC1/AC4). */
export function addPage<T extends Page>(list: T[], page: T): T[] {
  return [...list, page];
}

/** Remove the page with `id`, preserving order. No-op if absent (AC3). */
export function removePage<T extends Page>(list: T[], id: string): T[] {
  return list.filter((page) => page.id !== id);
}

/**
 * Move the page with `id` one slot up/down. Boundary-safe: returns the
 * SAME reference (no-op) at the edges or when `id` is absent, so callers
 * can rely on identity to skip redundant state updates (AC3).
 */
export function movePage<T extends Page>(
  list: T[],
  id: string,
  dir: "up" | "down",
): T[] {
  const i = list.findIndex((page) => page.id === id);
  if (i < 0) return list;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Keep the FIRST occurrence of each signature, preserving order (AC4).
 * Best-effort dedupe of identical re-captures; correctness of
 * near-duplicate pages is ultimately the Epic 2 reconciliation gate's job.
 */
export function dedupePages<T extends Page>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of list) {
    if (seen.has(page.signature)) continue;
    seen.add(page.signature);
    out.push(page);
  }
  return out;
}

/**
 * Defensive invariant gate (AC5): non-empty AND every page decided.
 * Under decided-by-construction this equals "list non-empty", but it
 * stays the single source of truth so the UI cannot bypass the rule.
 */
export function allPagesDecided(list: Page[]): boolean {
  return list.length > 0 && list.every((page) => page.decided === true);
}

export function orderedPageIds(list: Page[]): string[] {
  return list.map((page) => page.id);
}

/**
 * Best-effort, NON-cryptographic content signature for dedupe (AC4).
 * FNV-1a (32-bit) over the byte size + the caller-supplied bytes. The
 * caller MUST pass the FULL masked-blob bytes (not a short prefix):
 * same-device JPEGs share header prefixes, so a sampled signature would
 * collide across distinct receipt pages and silently drop a real page.
 * Not for security — only to drop an exact accidental re-capture.
 */
export function computeSignature(
  size: number,
  sample: ArrayLike<number>,
): string {
  let h = 0x811c9dc5; // FNV-1a offset basis
  const mix = (byte: number) => {
    h ^= byte & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime, keep uint32
  };
  let s = size >>> 0;
  for (let i = 0; i < 4; i++) {
    mix(s & 0xff);
    s >>>= 8;
  }
  for (let i = 0; i < sample.length; i++) mix(sample[i]);
  return `${(size >>> 0).toString(36)}-${(h >>> 0).toString(16)}`;
}
