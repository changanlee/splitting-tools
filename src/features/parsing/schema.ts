/**
 * Parsing API contract — the SINGLE Zod source (architecture: shared
 * Zod → inferred TS, type-safety without tRPC). Story 1.3.
 *
 * Pure: schemas + pure validators/mappers only. NO DOM, NO IO — fully
 * node-testable (AC4/AC8). Route Handlers / pg-boss / DB glue lives in
 * `server/` and is type-checked + integration-verified, not node-unit.
 */
import { z } from "zod";

/** Mirrors `parse_jobs.status` enum in src/db/schema.ts (1.1). */
export const PARSE_JOB_STATUSES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
  "degraded",
] as const;

export const ParseJobStatusSchema = z.enum(PARSE_JOB_STATUSES);
export type ParseJobStatus = z.infer<typeof ParseJobStatusSchema>;

/** POST /api/splits → create a session (the id == linkId; the
 *  unguessable-link scheme itself is Story 3.1, NOT pre-empted here). */
export const CreateSessionResponseSchema = z.object({
  linkId: z.string().min(1),
});
export type CreateSessionResponse = z.infer<
  typeof CreateSessionResponseSchema
>;

/** POST /api/splits/[linkId]/parse-jobs → enqueue, immediate jobId. */
export const ParseSubmitResponseSchema = z.object({
  jobId: z.string().min(1),
});
export type ParseSubmitResponse = z.infer<typeof ParseSubmitResponseSchema>;

/** GET /api/splits/[linkId]/parse-jobs/[jobId] → status (friendly only). */
export const ParseStatusResponseSchema = z.object({
  status: ParseJobStatusSchema,
  message: z.string().optional(),
});
export type ParseStatusResponse = z.infer<typeof ParseStatusResponseSchema>;

/** Unified error envelope — message is ALWAYS friendly (NFR-R1: raw
 *  LLM/stack errors never leave the server). */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * Hard page cap. Story 1.7 owns real per-session/IP budget enforcement
 * (rate_counters); this constant only bounds the request shape so a
 * single submit can't be unbounded. Keep in sync with the 1.7 decision.
 */
export const MAX_PARSE_PAGES = 5;

export interface SubmitParts {
  /** Number of pages the client claims to be sending. */
  pageCount: number;
  /** MIME type of each uploaded part, in order. */
  mimeTypes: string[];
}

export type SubmitValidation =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Pure request-shape validation for the multi-page submit (AC4). NOT a
 * security/budget gate (that is the budget seam → Story 1.7); only
 * rejects a malformed/oversized request shape with a friendly message.
 */
export function validateParseSubmit(p: SubmitParts): SubmitValidation {
  if (!Number.isInteger(p.pageCount) || p.pageCount < 1) {
    return {
      ok: false,
      code: "NO_PAGES",
      message: "沒有可解析的收據影像，請重拍一次。",
    };
  }
  if (p.pageCount > MAX_PARSE_PAGES) {
    return {
      ok: false,
      code: "TOO_MANY_PAGES",
      message: `一次最多 ${MAX_PARSE_PAGES} 頁，請減少頁數後再試。`,
    };
  }
  if (p.mimeTypes.length !== p.pageCount) {
    return {
      ok: false,
      code: "PART_COUNT_MISMATCH",
      message: "上傳內容不完整，請重試。",
    };
  }
  if (!p.mimeTypes.every((m) => m.startsWith("image/"))) {
    return {
      ok: false,
      code: "NOT_IMAGE",
      message: "只接受影像檔，請重拍一次。",
    };
  }
  return { ok: true };
}

/**
 * Map a job status to a friendly progress/error message (AC2/AC3).
 * `stored` is `parse_jobs.error`, which by contract is ALREADY friendly
 * (the worker never writes raw errors there). Pure.
 */
export function friendlyJobMessage(
  status: ParseJobStatus,
  stored?: string | null,
): string | undefined {
  switch (status) {
    case "queued":
      return "排隊中…";
    case "processing":
      return "解析中…";
    case "succeeded":
      return undefined;
    case "degraded":
      return "已用備援方式完成，結果可能較粗略。";
    case "failed":
      return stored && stored.length > 0
        ? stored
        : "解析失敗，請再試一次。";
  }
}

/** Terminal statuses → polling must stop (AC3, no idle spin). */
export function isTerminalStatus(status: ParseJobStatus): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "degraded"
  );
}

/* ───────────────────────── Story 1.4 ───────────────────────── */

/**
 * A single parsed receipt line (Story 1.4, AC3). Money is INTEGER CENTS
 * — never float (global money guardrail). `description` is the
 * abbreviation-restored, human-readable name; `rawText` preserves the
 * original cryptic line for 1.5 IRC attribution / reconciliation
 * traceability. IRC discount lines are parsed as ordinary negative-
 * amount lines here — attribution to a parent line is Story 1.5.
 */
export const ReceiptLineSchema = z.object({
  description: z.string().min(1),
  rawText: z.string().optional(),
  qty: z.number().int().positive(),
  amountCents: z.number().int(),
});
export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;

/** The full structured parse result the LLM must return (AC3). */
export const ParsedReceiptSchema = z.object({
  lines: z.array(ReceiptLineSchema),
});
export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;

/**
 * JSON Schema for the Anthropic `output_config.format` constraint.
 * Hand-written (kept in sync with ReceiptLineSchema) so it stays
 * independent of any SDK↔zod-version helper coupling. Structured-output
 * rules: every object needs `additionalProperties: false`; no
 * min/maxLength. The response is STILL re-validated by
 * ReceiptLineSchema (defense-in-depth, AC3).
 */
export const PARSED_RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          rawText: { type: "string" },
          qty: { type: "integer" },
          amountCents: { type: "integer" },
        },
        required: ["description", "qty", "amountCents"],
      },
    },
  },
  required: ["lines"],
} as const;
