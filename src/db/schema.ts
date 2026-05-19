/**
 * Drizzle schema — Story 1.1 minimal scaffold.
 *
 * 🚫 ONLY these 4 tables. receipt_lines / claims / claim_changes etc. are
 * added by later stories via ALTER/ADD on demand — do NOT pre-load them here.
 *
 * 🚫 G2 (architecture Important gap): pg-boss creates and owns its OWN
 * schema/tables at runtime. They MUST NOT appear in this file or in any
 * Drizzle migration. Init order is fixed: Drizzle migrate -> THEN pg-boss
 * start (see src/workers/index.ts).
 *
 * Money guardrail: app money is always integer cents, columns suffixed
 * `_cents`, never float. `cost_usd` is LLM-provider cost telemetry (ops
 * metric, not app money) and is numeric(10,6) per architecture spec.
 *
 * Ref: _bmad-output/planning-artifacts/architecture.md
 *      #Project-Structure-&-Boundaries (parse_jobs/llm_costs/rate_counters)
 */
import {
  bigserial,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** A split-bill session. Link id generation lands in Story 3.1. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  // draft | reconciled | shared | claiming | finalized
  status: text("status").notNull().default("draft"),
  parsedSumCents: integer("parsed_sum_cents"),
  printedTotalCents: integer("printed_total_cents"),
  unverified: boolean("unverified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Story 6.1 (30-day verifiable destruction) uses this.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/**
 * App-side parse job tracking. This is NOT the pg-boss internal job — the
 * two are deliberately separate (G2). pg-boss owns queue mechanics; this
 * row is the app's user-facing parse status.
 */
export const parseJobs = pgTable(
  "parse_jobs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    // queued | processing | succeeded | failed | degraded
    status: text("status").notNull().default("queued"),
    // Friendly message only — never store the raw LLM error.
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_parse_jobs_session_id").on(t.sessionId)],
);

/**
 * Per-call LLM cost/latency telemetry. Story 1.4 aggregates this
 * per-session-day for the budget gate (NFR-L2/L3). Cost tracking is
 * non-negotiable (Side Project standards #2/#5) — persisted, not in memory.
 */
export const llmCosts = pgTable(
  "llm_costs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: text("session_id").references(() => sessions.id),
    requestId: text("request_id").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 })
      .notNull()
      .default("0"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_llm_costs_session_id_created_at").on(t.sessionId, t.createdAt),
  ],
);

/**
 * Token-bucket / windowed rate + budget counters. Story 1.7 reads this for
 * the open parse-endpoint budget gate (FR46 / NFR-S7 / NFR-L5). Postgres,
 * not Redis (DAU<10k stage-0 playbook).
 */
export const rateCounters = pgTable("rate_counters", {
  // e.g. "session:<id>" / "ip:<sha256>"
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});
