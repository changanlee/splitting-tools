/**
 * visionAdapter — THE single boundary for the only external vision LLM
 * call (Story 1.4). Nothing else in the app may call this provider
 * (architecture L459/L554; enforced by static scan).
 *
 * Provider: 2026-05-20 migrated from `@anthropic-ai/sdk` direct to
 *           **OpenRouter** (OpenAI-compatible Chat Completions). The
 *           underlying model is unchanged — Anthropic's Sonnet 4.6
 *           primary + Haiku 4.5 fallback — but OpenRouter handles
 *           auth/billing/rate so we keep a single provider
 *           relationship. Raw `fetch` instead of the OpenAI SDK: our
 *           retry / backoff / cost / fallback logic is custom (see
 *           retry.ts, cost.ts), the SDK would be a thin HTTP wrapper
 *           around one POST — and dropping it removes a dep.
 *
 * LLM-Ops wrapper (the 7 non-negotiables, items 1/2/4/5 on-spec here):
 *  - NFR-L1: exp-backoff + jitter retry ≥3 (retry.ts), per model.
 *  - NFR-R1: degradation chain sonnet-4.6 → haiku-4.5 → friendly. Raw
 *            LLM/stack errors NEVER leave this module (friendly only).
 *  - NFR-L2: response Zod-validated (ParsedReceiptSchema) — structural
 *            failure is treated like a retryable/degradable error.
 *  - NFR-L3/L5: EVERY attempt writes a structured row to `llm_costs`
 *            (model/tokens/latency/cost/ids/success), per-session-day
 *            aggregatable. Cost via the pure cost.ts — OR uses
 *            OpenRouter's `usage.cost` when present (more accurate
 *            because it includes their markup).
 *  - NFR-L4: only called from the worker process (parseWorker), never a
 *            request thread.
 *
 * No OPENROUTER_API_KEY → friendly degraded result, NEVER crashes the
 * worker (real-LLM runtime verification is deferred → W-1-4-1).
 * The "cache / last-good" degradation tier is not implemented (no
 * prior-good store exists yet) → deferred W-1-4-2 (non-silent).
 */
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/client";
import { llmCosts } from "@/db/schema";
import {
  MAX_PARSE_PAGES,
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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// A ≤5-page receipt's JSON can exceed 8K output tokens; 16K stays safe.
const MAX_TOKENS = 16_000;

const SYSTEM_INSTRUCTION =
  "你是收據解析器。輸入是一張或多張同一張收據的連續分頁影像（已遮蔽會員卡號），順序為收據由上到下。" +
  "輸出兩件事：" +
  "(1) currency＝該收據幣別的 ISO 4217 三字母代碼（如 CNY、TWD、USD、JPY、HKD、KRW、EUR、GBP 等）。從幣別符號（¥/NT$/US$/￥/HK$/₩/€/£）、店家所在國家、地址或語言判讀；無法判讀則回空字串 \"\"。不要亂猜。" +
  "(2) lines＝逐行抽出每個品項：description＝把天書縮寫還原成可辨識的繁體中文/原文品名；" +
  "rawText＝該行原始文字（保留縮寫，供後續對帳追溯）；qty＝數量（正整數）；" +
  "amountCents＝該行金額的「整數分／角」（例如 16.50 元＝1650；嚴禁小數）。" +
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

const FRIENDLY_FAIL =
  "收據解析暫時失敗，請重拍一張清楚的收據再試一次。";

/**
 * OpenRouter's OpenAI-compat response shape (subset we read). They
 * extend `usage` with an optional `cost` field (final USD with
 * markup) — we prefer it when present, fall back to cost.ts otherwise.
 */
interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    /** OpenRouter-specific: final USD cost incl. markup. */
    cost?: number | null;
  };
}

/** Record one attempt to llm_costs (NFR-L2/L3). Best-effort —
 *  telemetry must never mask the parse outcome. */
async function recordCost(
  ctx: ParseContext,
  model: string,
  usage: OpenRouterResponse["usage"] | null,
  latencyMs: number,
  success: boolean,
): Promise<void> {
  try {
    const u = usage ?? {};
    const liveCost =
      typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0
        ? u.cost
        : null;
    const costUsd =
      liveCost !== null
        ? liveCost
        : computeCostUsd(model, {
            inputTokens: u.prompt_tokens ?? 0,
            outputTokens: u.completion_tokens ?? 0,
          });
    await db.insert(llmCosts).values({
      sessionId: ctx.sessionId,
      requestId: randomUUID(),
      model,
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      latencyMs,
      costUsd: costUsd.toFixed(6),
      success,
    });
  } catch (e) {
    console.error("[visionAdapter] llm_costs write failed:", e);
  }
}

/**
 * Parse a (multi-page) receipt via the single vision LLM boundary.
 * Returns a friendly outcome — never throws raw, never leaks the model
 * error.
 */
export async function parseReceiptImages(
  images: string[],
  mimeTypes: string[],
  ctx: ParseContext,
): Promise<ParseOutcome> {
  if (
    images.length === 0 ||
    images.length !== mimeTypes.length ||
    images.length > MAX_PARSE_PAGES ||
    images.some((d) => !d || d.length === 0)
  ) {
    return { kind: "failed", message: FRIENDLY_FAIL };
  }
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[visionAdapter] OPENROUTER_API_KEY not set — friendly degrade (W-1-4-1).",
    );
    return { kind: "failed", message: FRIENDLY_FAIL };
  }

  // Optional attribution headers — OpenRouter uses these for app
  // ranking on their model leaderboards; both safely ignored when absent.
  const attribution: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL) {
    attribution["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    attribution["X-Title"] = process.env.OPENROUTER_SITE_NAME;
  }

  // OpenAI-compatible vision: each image is a content part of
  // `{type:"image_url", image_url:{ url:"data:<mt>;base64,<b64>" }}`.
  const content = [
    { type: "text" as const, text: USER_INSTRUCTION },
    ...images.map((data, i) => ({
      type: "image_url" as const,
      image_url: { url: `data:${mediaType(mimeTypes[i])};base64,${data}` },
    })),
  ];

  const plan = buildAttemptPlan(DEGRADATION_MODELS);

  for (let i = 0; i < plan.length; i++) {
    const { model, attempt } = plan[i];
    const startedAt = Date.now();
    let status: number | undefined;
    try {
      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...attribution,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content },
          ],
          // OpenAI-compat structured outputs (schema-enforced JSON).
          // OpenRouter forwards this to Anthropic; sonnet-4.6 and
          // haiku-4.5 honour the schema. Defense-in-depth: we still
          // re-validate via ParsedReceiptSchema below (NFR-L2).
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "parsed_receipt",
              strict: true,
              schema: PARSED_RECEIPT_JSON_SCHEMA,
            },
          },
        }),
      });
      status = resp.status;
      const latency = Date.now() - startedAt;

      if (!resp.ok) {
        // Read+discard body to free the connection; we log only the
        // status (NFR-S3 — never raw content).
        await resp.text().catch(() => "");
        await recordCost(ctx, model, null, latency, false);
        if (status === 401 || status === 403) {
          console.error(
            `[visionAdapter] fatal auth status=${status} — aborting chain`,
          );
          return { kind: "failed", message: FRIENDLY_FAIL };
        }
        if (isRetryableStatus(status)) {
          if (i < plan.length - 1) {
            await new Promise((r) =>
              setTimeout(r, backoffWithJitterMs(attempt)),
            );
          }
          continue;
        }
        // Non-retryable on this model → skip remaining retries on
        // SAME model, jump straight to the next model in the chain.
        const next = plan.findIndex((s, j) => j > i && s.model !== model);
        if (next === -1) break;
        i = next - 1;
        continue;
      }

      const body = (await resp.json()) as OpenRouterResponse;
      const choice = body.choices?.[0];
      const finish = choice?.finish_reason;
      // OpenAI calls clean completions "stop"; some OpenRouter
      // upstream passthroughs report Anthropic's "end_turn" verbatim.
      // Either is a clean finish.
      if (finish !== "stop" && finish !== "end_turn") {
        console.warn(
          `[visionAdapter] non-stop finish_reason=${finish} model=${model}`,
        );
        await recordCost(ctx, model, body.usage ?? null, latency, false);
        continue;
      }

      const raw = choice?.message?.content ?? "";
      let parsed: ParsedReceipt;
      try {
        parsed = ParsedReceiptSchema.parse(JSON.parse(raw)); // NFR-L2
      } catch {
        console.warn(
          `[visionAdapter] response not schema-valid model=${model} textLen=${raw.length}`,
        );
        await recordCost(ctx, model, body.usage ?? null, latency, false);
        continue;
      }

      await recordCost(ctx, model, body.usage ?? null, latency, true);
      const degraded = model !== DEGRADATION_MODELS[0];
      return { kind: "parsed", receipt: parsed, degraded };
    } catch (err) {
      // Network-level error (DNS / ECONNRESET / fetch timeout) — no
      // HTTP status; treat as retryable.
      const latency = Date.now() - startedAt;
      await recordCost(ctx, model, null, latency, false);
      console.warn(
        "[visionAdapter] network error:",
        err instanceof Error ? err.message : String(err),
      );
      if (i < plan.length - 1) {
        await new Promise((r) =>
          setTimeout(r, backoffWithJitterMs(attempt)),
        );
      }
      continue;
    }
  }

  // Plan exhausted. Cache/last-good tier intentionally not implemented
  // (W-1-4-2). Friendly only.
  return { kind: "failed", message: FRIENDLY_FAIL };
}
