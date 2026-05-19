import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Migrations are emitted to drizzle/migrations and
 * applied (Drizzle migrate) BEFORE pg-boss starts (G2 init order).
 *
 * pg-boss tables are NOT managed here — pg-boss self-provisions at runtime.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  // Fail loudly — consistent with src/lib/db/client.ts and the worker. A
  // silent localhost fallback could point `db:migrate` at the WRONG
  // database instead of erroring.
  throw new Error(
    "DATABASE_URL is not set. See .env.example (Story 1.1 scaffold).",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
