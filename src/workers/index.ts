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

const MIGRATIONS_FOLDER = "drizzle/migrations";
const DB_WAIT_MAX_ATTEMPTS = 30;
const DB_WAIT_DELAY_MS = 2000;

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
  for (let attempt = 1; attempt <= DB_WAIT_MAX_ATTEMPTS; attempt++) {
    try {
      await pool.query("select 1");
      console.log(`[worker] database reachable (attempt ${attempt})`);
      return;
    } catch {
      console.log(
        `[worker] waiting for database… (${attempt}/${DB_WAIT_MAX_ATTEMPTS})`,
      );
      await sleep(DB_WAIT_DELAY_MS);
    }
  }
  throw new Error("[worker] database not reachable after max attempts");
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
  boss.on("error", (err: unknown) =>
    console.error("[worker] pg-boss error:", err),
  );
  await boss.start();
  console.log("[worker] pg-boss started (queue ready)");

  // Story 1.1: no job consumers yet. Story 1.3/1.4 register parseWorker
  // via src/lib/llm/visionAdapter (never bypass it).

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, stopping…`);
    await boss.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
