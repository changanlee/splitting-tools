/**
 * pg-boss PRODUCER for the web process — Story 1.3 (AC1/AC6).
 *
 * 🚫 PRODUCER ONLY. The consumer (`parseWorker` → `visionAdapter`) is
 * Story 1.4 — do NOT add `boss.work(...)` here. G2 init order is the
 * worker's concern (1.1); this producer only `start()`s its own client
 * to enqueue, sharing the single Postgres (architecture).
 *
 * Images ride as base64 in the job payload (single-Postgres design;
 * no src/db/schema.ts table change; cross-container via the shared
 * queue; bounded by MAX_PARSE_PAGES). Moving large blobs to object
 * storage is a documented Phase-later scale concern
 * (deferred-work W-1-3-2).
 */
import { PgBoss } from "pg-boss";

export const PARSE_QUEUE = "parse";

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

/** Lazy singleton: start pg-boss once, ensure the queue exists once. */
async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const boss = new PgBoss(connectionString());
      // A queue-level error must not crash the request thread; the
      // friendly job-status surfaces failure (NFR-R1).
      boss.on("error", (err: unknown) =>
        console.error("[parse-producer] pg-boss error:", err),
      );
      await boss.start();
      // pg-boss v12 requires an explicit queue; idempotent if it
      // already exists (the 1.4 worker may also ensure it).
      try {
        await boss.createQueue(PARSE_QUEUE);
      } catch {
        // queue already exists — safe to ignore.
      }
      return boss;
    })();
  }
  return bossPromise;
}

export interface ParseJobPayload {
  sessionId: string;
  jobId: string;
  pageCount: number;
  /** Ordered, base64-encoded MASKED+compressed page images. Order ==
   *  receipt top→bottom (Story 1.4/1.5 cross-page sum depends on it). */
  images: string[];
  mimeTypes: string[];
}

/** Enqueue a parse job. Returns immediately after the queue accepts it
 *  (the actual LLM parse is the Story 1.4 worker). */
export async function enqueueParse(payload: ParseJobPayload): Promise<void> {
  const boss = await getBoss();
  await boss.send(PARSE_QUEUE, payload);
}
