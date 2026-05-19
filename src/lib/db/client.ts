/**
 * Single Postgres connection boundary (pg Pool + Drizzle).
 *
 * One Postgres carries app tables + pg-boss queue + cost/rate counters
 * (architecture: single monolith, single Postgres, no Redis — DAU<10k
 * stage-0).
 *
 * 🔒 LAZY by design: the connection AND the loud `DATABASE_URL` check
 * happen on FIRST USE, not at import. `next build` "collecting page
 * data" imports every route module (Story 1.3 routes import this); an
 * eager top-level throw would break the build with no DB env present.
 * The fail-loud contract is UNCHANGED — any actual query without
 * DATABASE_URL still throws the same error, just at use-time (where the
 * env IS set: request/worker runtime) instead of import-time.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _pool: Pool | null = null;
let _db: DrizzleDb | null = null;

function init(): void {
  if (_db) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. See .env.example (Story 1.1 scaffold).",
    );
  }
  _pool = new Pool({ connectionString });
  _db = drizzle(_pool, { schema });
}

function lazyProxy<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      // Not a thenable: an accidental `await db` / Promise.resolve(db)
      // must NOT run init() early nor treat the proxy as a promise.
      if (prop === "then") return undefined;
      init();
      const real = pick() as Record<string | symbol, unknown>;
      const value = real[prop];
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(real)
        : value;
    },
  });
}

export const db: DrizzleDb = lazyProxy(() => _db as DrizzleDb);
export const pool: Pool = lazyProxy(() => _pool as Pool);

export { schema };
