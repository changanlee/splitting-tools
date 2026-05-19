/**
 * Single Postgres connection boundary (pg Pool + Drizzle).
 *
 * One Postgres carries app tables + pg-boss queue + cost/rate counters
 * (architecture: single monolith, single Postgres, no Redis — DAU<10k
 * stage-0). Story 1.1 only wires the client; query usage lands in later
 * stories.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. See .env.example (Story 1.1 scaffold).",
  );
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export { schema };
