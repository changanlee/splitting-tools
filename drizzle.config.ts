import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. Migrations are emitted to drizzle/migrations and
 * applied (Drizzle migrate) BEFORE pg-boss starts (G2 init order).
 *
 * pg-boss tables are NOT managed here — pg-boss self-provisions at runtime.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/splitting",
  },
  strict: true,
  verbose: true,
});
