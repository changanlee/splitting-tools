/**
 * visionAdapter — THE single boundary for the only external Claude
 * vision call (Story 1.4). Nothing else in the app may call Anthropic
 * (architecture L459/L554; enforced by static scan).
 *
 * LLM-Ops wrapper (the 7 non-negotiables, items 1/2/4/5 on-spec here):
 *  - NFR-L1: exp-backoff + jitter retry ≥3 (retry.ts), per model.
 *  - NFR-R1: degradation chain sonnet-4-6 → haiku-4-5 → friendly. Raw
 *            LLM/stack errors NEVER leave this module (friendly only).
 *  - NFR-L2: response Zod-validated (ParsedReceiptSchema) — structural
 *            failure is treated like a retryable/degradable error.
 *  - NFR-L3/L5: EVERY attempt writes a structured row to `llm_costs`
 *            (model/tokens/latency/cost/ids/success), per-session-day
 *            aggregatable. Cost via the pure cost.ts.
 *  - NFR-L4: only called from the worker process (parseWorker), never a
 *            request thread.
 *
 * No ANTHROPIC_API_KEY → friendly degraded result, NEVER crashes the
 * worker (real-Claude runtime verification is deferred → W-1-4-1).
 * The "cache / last-good" degradation tier is not implemented (no
 * prior-good store exists yet) → deferred W-1-4-2 (non-silent).
 */
import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";

import { db } from "@/lib/db/client";
import { llmCosts } from "@/db/schema";
import {
  PARSED_RECEIPT_JSON_SCHEMA,
  ParsedReceiptSchema,
  type ParsedReceipt,
} from "@/features/parsing/schema";
import { computeCostUsd } from "@/lib/llm/cost";
import { DEGRADATION_MODELS } from "@/lib/llm/models";
import {
  backoffWithJitterMs,
  buildAttemptPlan,
  isRetryableStatus,
} from "@/lib/llm/retry";

const MAX_TOKENS = 8000;

const SYSTEM_INSTRUCTION =
  "你是收據解析器。輸入是一張或多張同一張收據的連續分頁影像（已遮蔽會員卡號），順序為收據由上到下。" +
  "逐行抽出每個品項：description＝把天書縮寫還原成可辨識的繁體中文/原文品名；" +
  "rawText＝該行原始文字（保留縮寫，供後續對帳追溯）；qty＝數量（正整數）；" +
  "amountCents＝該行金額的「整數分」（例如 16.50 元＝1650；嚴禁小數）。" +
  "IRC／折扣等負項視為一般負額品項照常輸出（不要在此歸屬母品項）。" +
  "只輸出符合給定 JSON schema 的結果，不要加任何解釋文字。";

const USER_INSTRUCTION =
  "解析這張收據的所有逐行品項，依 schema 回傳。";

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
function mediaType(m: string | undefined): MediaType {
  if (m === "image/png") return "image/png";
  if (m === "image/webp") return "image/webp";
  if (m === "image/gif") return "image/gif";
  return "image/jpeg"; // our pipeline always produces JPEG
}

export interface ParseContext {
  sessionId: string;
  jobId: string;
}

export type ParseOutcome =
  | { kind: "parsed"; receipt: ParsedReceipt; degraded: boolean }
  | { kind: "failed"; message: string };

/** Friendly, never-raw failure copy (NFR-R1). */
const FRIENDLY_FAIL =
  "收據解析暫時失敗，請重拍一張清楚的收據再試一次。";

/** Record one Claude attempt to llm_costs (NFR-L2/L3). Best-effort:
 *  a telemetry write must never mask the parse outcome. */
async function recordCost(
  ctx: ParseContext,
  model: string,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null,
  latencyMs: number,
  success: boolean,
): Promise<void> {
  try {
    const u = usage ?? {};
    await db.insert(llmCosts).values({
      sessionId: ctx.sessionId,
      requestId: randomUUID(),
      model,
      promptTokens: u.input_tokens ?? 0,
      completionTokens: u.output_tokens ?? 0,
      latencyMs,
      costUsd: computeCostUsd(model, {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheCreationInputTokens: u.cache_creation_input_tokens ?? undefined,
        cacheReadInputTokens: u.cache_read_input_tokens ?? undefined,
      }).toFixed(6),
      success,
    });
  } catch (e) {
    console.error("[visionAdapter] llm_costs write failed:", e);
  }
}

function statusOf(err: unknown): number | undefined {
  return err instanceof Anthropic.APIError ? err.status : undefined;
}

/**
 * Parse a (multi-page) receipt via the single Claude vision boundary.
 * Returns a friendly outcome — never throws raw, never leaks the model
 * error.
 */
export async function parseReceiptImages(
  images: string[],
  mimeTypes: string[],
  ctx: ParseContext,
): Promise<ParseOutcome> {
  if (images.length === 0) {
    return { kind: "failed", message: FRIENDLY_FAIL };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    // No key in this environment: degrade gracefully, do NOT crash the
    // worker. Real-Claude verification is deferred (W-1-4-1).
    console.warn(
      "[visionAdapter] ANTHROPIC_API_KEY not set — friendly degrade (W-1-4-1).",
    );
    return { kind: "failed", message: FRIENDLY_FAIL };
  }

  const client = new Anthropic();
  const content = [
    ...images.map((data, i) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType(mimeTypes[i]),
        data,
      },
    })),
    { type: "text" as const, text: USER_INSTRUCTION },
  ];

  const plan = buildAttemptPlan(DEGRADATION_MODELS);

  for (let i = 0; i < plan.length; i++) {
    const { model, attempt } = plan[i];
    const startedAt = Date.now();
    try {
      const resp = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: SYSTEM_INSTRUCTION,
            cache_control: { type: "ephemeral" },
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: PARSED_RECEIPT_JSON_SCHEMA,
          },
        },
        messages: [{ role: "user", content }],
      });

      const latency = Date.now() - startedAt;

      if (resp.stop_reason === "refusal" || resp.stop_reason === "max_tokens") {
        await recordCost(ctx, model, resp.usage, latency, false);
        continue; // structural / refusal → next attempt (degrade)
      }

      const textBlock = resp.content.find((b) => b.type === "text");
      const raw =
        textBlock && textBlock.type === "text" ? textBlock.text : "";
      let parsed: ParsedReceipt;
      try {
        parsed = ParsedReceiptSchema.parse(JSON.parse(raw)); // NFR-L2
      } catch {
        await recordCost(ctx, model, resp.usage, latency, false);
        continue; // invalid structure → degrade
      }

      await recordCost(ctx, model, resp.usage, latency, true);
      // `degraded` true if we didn't succeed on the primary model's
      // first attempt.
      const degraded = !(model === DEGRADATION_MODELS[0] && attempt === 1);
      return { kind: "parsed", receipt: parsed, degraded };
    } catch (err) {
      const latency = Date.now() - startedAt;
      await recordCost(ctx, model, null, latency, false);
      const status = statusOf(err);
      if (isRetryableStatus(status)) {
        // Transient: back off, then the NEXT plan step (same model
        // until its retries are exhausted, then the cheaper model).
        const isLastStep = i === plan.length - 1;
        if (!isLastStep) {
          await new Promise((r) =>
            setTimeout(r, backoffWithJitterMs(attempt)),
          );
          continue;
        }
      }
      // Non-retryable (4xx) → still try degrading to the next model;
      // the loop continues. Raw error never escapes.
      continue;
    }
  }

  // Plan exhausted (retries + model degradation). The cache/last-good
  // tier is intentionally not implemented (W-1-4-2). Friendly only.
  return { kind: "failed", message: FRIENDLY_FAIL };
}
