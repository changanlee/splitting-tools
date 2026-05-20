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
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** A split-bill session. Link id generation lands in Story 3.1. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  // draft | reconciled | shared | claiming | finalized
  status: text("status").notNull().default("draft"),
  parsedSumCents: integer("parsed_sum_cents"),
  printedTotalCents: integer("printed_total_cents"),
  unverified: boolean("unverified").notNull().default(false),
  // ISO 4217 currency code stamped by the parser from the receipt image
  // (e.g. "CNY", "TWD", "USD"). Null until the first successful parse;
  // formatCents falls back to no prefix when null.
  currency: text("currency"),
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

/**
 * Parsed + IRC-attributed receipt lines (Story 1.5 — THE owner of this
 * table; 1.3/1.4 were forbidden from schema changes, 1.5 adds it).
 *
 * Money is integer cents (money guardrail; IRC lines are negative).
 * `irc_attributed_to` is a SELF reference to the parent's `id` — kept
 * as a plain column (no hard FK) so insert order can't deadlock a
 * self-cycle; the IRC algorithm guarantees referential validity.
 */
export const receiptLines = pgTable(
  "receipt_lines",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    parseJobId: text("parse_job_id")
      .notNull()
      .references(() => parseJobs.id),
    // Receipt top→bottom order (cross-page already concatenated, 1.2b).
    lineNo: integer("line_no").notNull(),
    description: text("description").notNull(),
    rawText: text("raw_text"),
    qty: integer("qty").notNull(),
    // Original line amount; IRC discount lines are negative.
    grossCents: integer("gross_cents").notNull(),
    // Parent = gross + Σ(its IRC); normal = gross; IRC = own amount.
    netCents: integer("net_cents").notNull(),
    isIrc: boolean("is_irc").notNull().default(false),
    // IRC lines are never independently claimable (FR6).
    claimable: boolean("claimable").notNull().default(true),
    // IRC line → parent receipt_lines.id; else null (self-ref, no FK).
    ircAttributedTo: text("irc_attributed_to"),
    // IRC with no matching parent — kept for Epic 2 re-bind, not lost.
    orphan: boolean("orphan").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // DB-level idempotency backstop: a job's lines are (delete+insert)
    // rewritten in one transaction (persistReceiptLines); this UNIQUE
    // also fails loud if a concurrent redelivery ever double-inserts.
    // Its leading column is parse_job_id, so it doubles as the
    // by-job lookup index (no separate idx_receipt_lines_job needed).
    uniqueIndex("uq_receipt_lines_job_line_no").on(t.parseJobId, t.lineNo),
    index("idx_receipt_lines_session").on(t.sessionId),
  ],
);

/**
 * Identities — Story 4.1/4.2. One person (claimant) per session,
 * bound to a device token (`device_token_hash` = sha256 of the
 * raw token; raw never persisted — NFR-S3 privacy).
 *
 * Linked to sessions only; no global user table.
 */
export const identities = pgTable(
  "identities",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    name: text("name").notNull(),
    deviceTokenHash: text("device_token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_identities_session").on(t.sessionId),
    index("idx_identities_session_token").on(t.sessionId, t.deviceTokenHash),
  ],
);

/**
 * Claims — Story 4.4/4.5. One identity claims one receipt line;
 * `weight` defaults to 1 (4.5 weighted shares).
 *
 * UNIQUE (receipt_line_id, identity_id) — one identity can claim a
 * line at most once (toggle on/off; weight changes via separate
 * action). The (line, identity) → single claim row.
 */
export const claims = pgTable(
  "claims",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    receiptLineId: text("receipt_line_id")
      .notNull()
      .references(() => receiptLines.id),
    identityId: text("identity_id")
      .notNull()
      .references(() => identities.id),
    weight: integer("weight").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_claims_line_identity").on(t.receiptLineId, t.identityId),
    index("idx_claims_session").on(t.sessionId),
    index("idx_claims_identity").on(t.identityId),
  ],
);

/**
 * Claim change log — Story 4.9 / FR-audit. Append-only history of
 * mutations the payer can review (claim/unclaim/edit/add/delete/
 * force-pass etc.). bigserial pk; jsonb details for shape flexibility.
 */
export const claimChanges = pgTable(
  "claim_changes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    receiptLineId: text("receipt_line_id"),
    identityId: text("identity_id"),
    action: text("action").notNull(),
    details: text("details"), // JSON-as-text — keeps dependency surface tight
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_claim_changes_session_created_at").on(t.sessionId, t.createdAt)],
);
