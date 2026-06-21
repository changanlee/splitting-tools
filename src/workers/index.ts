/**
 * Worker process entrypoint.
 *
 * 🚫 G2 (architecture Important gap) — FIXED INIT ORDER:
 *      1. wait for Postgres to accept connections
 *      2. run Drizzle migrate (drizzle/migrations)
 *      3. ONLY THEN start pg-boss
 *
 * pg-boss self-provisions its OWN schema/tables at runtime. Those tables
 * are deliberately absent from src/db/schema.ts and from every Drizzle
 * migration — letting Drizzle manage them would cause migration conflicts.
 * Starting pg-boss before Drizzle migrate could race table creation, so
 * the order above is non-negotiable.
 *
 * Story 1.1 scope: this entrypoint only proves the boot order and the
 * single-Postgres wiring. Parse-job consumers (parseWorker) are added in
 * Story 1.3/1.4 and MUST go through src/lib/llm/visionAdapter.
 *
 * Ref: architecture.md#Architecture-Validation-Results (Gap G2),
 *      #Project-Structure-&-Boundaries (workers/).
 */
import { setTimeout as sleep } from "node:timers/promises";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgBoss } from "pg-boss";
import { Pool } from "pg";

import { registerLifecycleWorker } from "@/workers/lifecycleWorker";
import { registerMatchWorker } from "@/workers/matchWorker";
import { registerParseWorker } from "@/workers/parseWorker";

const MIGRATIONS_FOLDER = "drizzle/migrations";
const DB_WAIT_MAX_ATTEMPTS = 30;
const DB_WAIT_DELAY_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. See .env.example (Story 1.1 scaffold).",
    );
  }
  return url;
}

/** Step 1: block until Postgres accepts connections (compose race-safe). */
async function waitForDatabase(pool: Pool): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DB_WAIT_MAX_ATTEMPTS; attempt++) {
    try {
      await pool.query("select 1");
      console.log(`[worker] database reachable (attempt ${attempt})`);
      return;
    } catch (err) {
      lastError = err;
      const detail = err instanceof Error ? err.message : String(err);
      // Log the real cause every attempt: a permanent misconfig (bad
      // credentials / DATABASE_URL / SSL) must not masquerade as a
      // transient "not reachable yet" with no diagnostic.
      console.log(
        `[worker] waiting for database… (${attempt}/${DB_WAIT_MAX_ATTEMPTS}): ${detail}`,
      );
      await sleep(DB_WAIT_DELAY_MS);
    }
  }
  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[worker] database not reachable after ${DB_WAIT_MAX_ATTEMPTS} attempts: ${detail}`,
  );
}

async function main(): Promise<void> {
  const connectionString = getConnectionString();
  const pool = new Pool({ connectionString });

  // 1. wait for DB
  await waitForDatabase(pool);

  // 2. Drizzle migrate — MUST complete before pg-boss starts (G2)
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  console.log("[worker] drizzle migrate complete");

  // 3. ONLY NOW start pg-boss (it self-creates its own schema/tables;
  //    NOT tracked by Drizzle — G2)
  const boss = new PgBoss(connectionString);
  // W-CR-1: a post-start pg-boss error must not leave a silently-dead
  // worker. Log it and exit non-zero so the orchestrator restarts us
  // (compose `restart` policy) rather than treating a broken queue as
  // healthy. (1.4 adds the consumer, so this trigger lands here.)
  boss.on("error", (err: unknown) => {
    console.error("[worker] FATAL pg-boss error, exiting:", err);
    process.exit(1);
  });
  await boss.start();
  console.log("[worker] pg-boss started (queue ready)");

  // Story 1.4: register THE parse consumer (boss.work). All Claude
  // calls go through src/lib/llm/visionAdapter — never bypassed.
  await registerParseWorker(boss);
  // Story 8.1 — register THE photo-match consumer (boss.work). All vision
  // calls go through src/lib/llm/matchProductsAdapter — never bypassed.
  await registerMatchWorker(boss);
  // Story 6.1 — schedule the 30-day verifiable destruction job.
  await registerLifecycleWorker(boss);
  console.log("[worker] parseWorker + matchWorker registered (consumers ready)");

  let stopping = false;
  const shutdown = async (signal: string) => {
    // A second signal (e.g. SIGTERM then SIGINT, or a repeated Ctrl-C)
    // must not re-enter: `pool.end()` twice throws, and racing exits can
    // truncate in-flight cleanup.
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received, stopping…`);

    const timeout = sleep(SHUTDOWN_TIMEOUT_MS).then(() => {
      throw new Error(`shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms`);
    });
    try {
      // Bounded: if boss.stop()/pool.end() hang or reject, we still exit
      // instead of wedging the container until SIGKILL.
      await Promise.race([
        (async () => {
          await boss.stop();
          await pool.end();
        })(),
        timeout,
      ]);
      console.log("[worker] clean shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[worker] shutdown error/timeout, forcing exit:", err);
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
