/**
 * pg-boss PRODUCER for photo-assisted claim — Story 8.1.
 *
 * 🚫 PRODUCER ONLY. The consumer (`matchWorker` → `matchProductsAdapter`)
 * runs in the worker process. Mirrors the parse producer (`queue.ts`):
 * lazy singleton boss, images ride as base64 in the payload (single-
 * Postgres design; bounded by MAX_PARSE_PAGES), no schema-table change.
 *
 * Fire-and-forget (Phase 1): the worker SEEDS claims directly into the
 * existing `claims` table, so the claim board reflects the result on its
 * next render — no separate match-job status table / polling in v1.
 */
import { PgBoss } from "pg-boss";

export const MATCH_QUEUE = "match";

let bossPromise: Promise<PgBoss> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. See .env.example (Story 1.1 scaffold).",
    );
  }
  return url;
}

async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss(connectionString());
      boss.on("error", (err: unknown) =>
        console.error("[match-producer] pg-boss error:", err),
      );
      await boss.start();
      try {
        await boss.createQueue(MATCH_QUEUE);
      } catch (e) {
        console.warn("[match-producer] createQueue:", e);
      }
      return boss;
    })().catch((err) => {
      bossPromise = null; // allow a later request to retry start()
      throw err;
    });
  }
  return bossPromise;
}

export interface MatchJobPayload {
  sessionId: string;
  /** The claiming identity the matched lines are seeded to. */
  identityId: string;
  /** Ordered base64 product photos (≤ MAX_PARSE_PAGES). */
  images: string[];
  mimeTypes: string[];
}

/** Enqueue a photo-match job. Returns once the queue accepts it (the
 *  vision match + claim seeding is the worker's job). */
export async function enqueueMatch(payload: MatchJobPayload): Promise<void> {
  const boss = await getBoss();
  await boss.send(MATCH_QUEUE, payload);
}
