/**
 * verifyTranslations — Pass 2 of the foreign-receipt feature (2026-06-20).
 *
 * The SECOND LLM boundary (alongside visionAdapter). Takes the lines the
 * vision parse flagged `descriptionConfidence === "low"` and asks the
 * model — WITH OpenRouter web search enabled — for the correct/common
 * Traditional-Chinese product name of each, so an abroad receipt (e.g.
 * Korean) splits with names people actually recognise.
 *
 * Same provider + model PIN as the vision parse: `anthropic/claude-
 * sonnet-4.6` via OpenRouter (ops/model-registry.md §2). We add the
 * OpenRouter `web` plugin — that is engine-agnostic and needs NO new
 * model pin (registry §5 logs the plugin adoption, not a pin change).
 *
 * Web search via the `plugins:[{id:"web"}]` form. OpenRouter is migrating
 * this to the `openrouter:web_search` server tool; the plugin still works
 * and is single-request — migrate when the plugin is retired. Docs:
 * https://openrouter.ai/docs/guides/features/plugins/web-search
 *
 * LLM-Ops discipline (mirrors visionAdapter):
 *  - NFR-L1: exp-backoff + jitter retry on PRIMARY only (retry.ts). No
 *            haiku fallback — this is a best-effort enrichment, not the
 *            core parse; on exhaustion we keep the Pass-1 translations.
 *  - NFR-L2: response Zod-validated (VerifiedTranslationSchema).
 *  - NFR-L3: every attempt writes an `llm_costs` row (recordLlmCost).
 *  - NFR-R2: NEVER throws; returns `[]` on any failure → caller keeps the
 *            unverified zh-TW names and the payer is never blocked.
 *  - NFR-L4: worker-process only (called from parseWorker).
 *  - Cost (#2/#7): only fires when ≥1 low-confidence line exists and is
 *    capped upstream (MAX_VERIFY_LINES); web search ≈ $0.005–0.02/receipt.
 */
import {
  VerifiedTranslationSchema,
  type LowConfidenceLine,
  type VerifiedTranslation,
} from "@/features/parsing/verify";
import { recordLlmCost } from "@/lib/llm/costLog";
import { PRIMARY_MODEL } from "@/lib/llm/models";
import { backoffWithJitterMs, buildAttemptPlan } from "@/lib/llm/retry";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// The verify reply is small (one short name per line); 2K is ample.
const MAX_TOKENS = 2_000;

const SYSTEM_INSTRUCTION =
  "你是收據品名校正員。會給你幾筆收據品項，每筆有 index、rawText（原始外語文字）、description（暫譯繁中）。" +
  "請用網路搜尋查出每筆「正確、通用」的繁體中文品名（品牌＋品項），品牌名保留可辨識。" +
  "查得到官方／通用譯名就用它；查不到就沿用原本的 description，不要亂猜。" +
  "務必對【每一個輸入 index】都回一筆 results（index 原樣帶回，description 為最終繁中品名）。" +
  "只輸出符合 JSON schema 的結果，不要加任何解釋或引用標記。";

const VERIFY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          description: { type: "string" },
        },
        required: ["index", "description"],
      },
    },
  },
  required: ["results"],
} as const;

interface OpenRouterResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    cost?: number | null;
  };
}

/**
 * Tolerant JSON extraction: web-search replies occasionally wrap the
 * object in prose / citation markers despite the schema. Try a clean
 * parse first, then fall back to the outermost {...} slice.
 */
function parseLoose(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("no JSON object in verify reply");
  }
}

/**
 * Web-verify the Traditional-Chinese names of low-confidence lines.
 * Best-effort: returns the verified `results` (validated) or `[]` on any
 * failure / missing key. Never throws (NFR-R2).
 */
export async function verifyTranslations(
  lines: LowConfidenceLine[],
  sessionId: string,
): Promise<VerifiedTranslation["results"]> {
  if (lines.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[verifyTranslations] OPENROUTER_API_KEY not set — skip verify (keep Pass-1 names).",
    );
    return [];
  }

  const attribution: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL) {
    attribution["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    attribution["X-Title"] = process.env.OPENROUTER_SITE_NAME;
  }

  const userPayload = JSON.stringify({
    items: lines.map((l) => ({
      index: l.index,
      rawText: l.rawText,
      description: l.description,
    })),
  });

  // PRIMARY only, with retries — no degradation tier (best-effort).
  const plan = buildAttemptPlan([PRIMARY_MODEL]);

  for (let i = 0; i < plan.length; i++) {
    const { model, attempt } = plan[i];
    const startedAt = Date.now();
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
          plugins: [{ id: "web", max_results: 5 }],
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: userPayload },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "verified_translations",
              strict: true,
              schema: VERIFY_JSON_SCHEMA,
            },
          },
        }),
      });
      const latency = Date.now() - startedAt;

      if (!resp.ok) {
        await resp.text().catch(() => "");
        await recordLlmCost(sessionId, model, null, latency, false);
        // Auth errors won't fix on retry — give up, keep Pass-1 names.
        if (resp.status === 401 || resp.status === 403) return [];
        if (i < plan.length - 1) {
          await new Promise((r) => setTimeout(r, backoffWithJitterMs(attempt)));
        }
        continue;
      }

      const body = (await resp.json()) as OpenRouterResponse;
      const raw = body.choices?.[0]?.message?.content ?? "";
      try {
        const validated = VerifiedTranslationSchema.parse(parseLoose(raw));
        await recordLlmCost(sessionId, model, body.usage ?? null, latency, true);
        return validated.results;
      } catch {
        await recordLlmCost(sessionId, model, body.usage ?? null, latency, false);
        if (i < plan.length - 1) {
          await new Promise((r) => setTimeout(r, backoffWithJitterMs(attempt)));
        }
        continue;
      }
    } catch (err) {
      const latency = Date.now() - startedAt;
      await recordLlmCost(sessionId, model, null, latency, false);
      console.warn(
        "[verifyTranslations] network error:",
        err instanceof Error ? err.message : String(err),
      );
      if (i < plan.length - 1) {
        await new Promise((r) => setTimeout(r, backoffWithJitterMs(attempt)));
      }
      continue;
    }
  }

  // Exhausted — keep the Pass-1 translations (never blocks the payer).
  return [];
}
