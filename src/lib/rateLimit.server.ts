/**
 * Parse-endpoint budget — server glue (Story 1.7 / FR46). Drizzle SQL
 * UPSERT against `rate_counters` (1.1 schema, zero migration). Glue is
 * NOT node-tested per the established convention — the maths is the
 * pure `decideRateLimit` in `./rateLimit.ts`; the DB statement is
 * verified by typecheck + build + W-1-7-2 (post-deploy real-traffic
 * race / burst tuning).
 *
 * Atomicity: a single SQL `INSERT ... ON CONFLICT (key) DO UPDATE`
 * statement does the window-reset OR increment in one round-trip, then
 * returns the post-state which we compare to the limit. A concurrent
 * burst can over-count slightly at the moment of crossing — accepted
 * v1 grief-shield tradeoff (counted past the cap reduces refresh, not
 * increases it).
 */
import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

export interface RateCheckResult {
  allow: boolean;
  /** ms until the current window resets (only meaningful when allow=false). */
  retryAfterMs: number;
}

/**
 * Atomically apply the page count to a key and return the post-state.
 * The CASE inside the UPDATE handles window reset vs increment without
 * a read-modify-write race.
 */
export async function checkAndIncrementRate(
  key: string,
  pages: number,
  limit: number,
  windowMs: number,
): Promise<RateCheckResult> {
  // Validate inputs defensively (endpoint already pre-validates, but a
  // bad call must never produce a free pass — clamp pages to a sane
  // positive integer).
  const p =
    Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0;
  if (p === 0) return { allow: true, retryAfterMs: 0 };

  const intervalSql = sql.raw(`INTERVAL '${Math.floor(windowMs)} milliseconds'`);
  const rows = (await db.execute(sql`
    INSERT INTO rate_counters (key, window_start, count)
    VALUES (${key}, NOW(), ${p})
    ON CONFLICT (key) DO UPDATE SET
      window_start = CASE
        WHEN rate_counters.window_start < NOW() - ${intervalSql}
          THEN NOW()
        ELSE rate_counters.window_start
      END,
      count = CASE
        WHEN rate_counters.window_start < NOW() - ${intervalSql}
          THEN ${p}
        ELSE rate_counters.count + ${p}
      END
    RETURNING count, window_start, EXTRACT(EPOCH FROM (NOW() - window_start)) * 1000 AS elapsed_ms
  `)) as unknown as {
    rows: Array<{ count: number; window_start: Date; elapsed_ms: number | string }>;
  };

  const row = rows.rows[0];
  if (!row) {
    // Defensive: an empty RETURNING means the upsert didn't happen as
    // expected — fail-OPEN per AC6 v1 tradeoff (do not block payer on
    // unexpected DB shape; W-1-7-1).
    return { allow: true, retryAfterMs: 0 };
  }
  const count = Number(row.count);
  const elapsedMs = Number(row.elapsed_ms);
  if (count > limit) {
    const retryAfterMs = Math.max(0, windowMs - elapsedMs);
    return { allow: false, retryAfterMs };
  }
  return { allow: true, retryAfterMs: 0 };
}

/**
 * Hashed IP key — `ip:<32-hex>`. Architecture L259 (privacy NFR-S3):
 * raw IP is NEVER persisted. The truncated 32-hex prefix is more than
 * enough for collision-free grief-shield buckets (~10^38 entropy).
 */
export function sha256IpKey(ip: string): string {
  const hex = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  return `ip:${hex}`;
}

/**
 * Extract the client IP from request headers. v1 assumes a single
 * trusted proxy hop (Cloudflare / Vercel); take the first XFF token.
 * Defensively fall back to common headers; if none → a single
 * "unknown" bucket (safe degradation — all unknown clients share one
 * counter, which is the right grief behaviour: an attacker stripping
 * headers gets the same bucket as everyone else doing it).
 */
export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}
