/**
 * matchProductsAdapter — photo-assisted claim vision boundary (Story 8.1).
 *
 * A THIRD LLM boundary (alongside visionAdapter + verifyTranslations).
 * Takes the physical-product photo(s) a claimer took and the session's
 * claimable receipt lines, and asks the model — per line — whether it sees
 * that item in the photo and how confident it is. The pure selection
 * (confidence threshold → auto-claim vs confirm) lives in
 * `src/features/claiming/photoMatch.ts`.
 *
 * Same provider + model PIN as the receipt parse: `anthropic/
 * claude-sonnet-4.6` → `haiku-4.5` via OpenRouter (registry §2) — NO new
 * pin. NO web plugin (pure vision; avoids the web-search cost blow-up seen
 * in verifyTranslations).
 *
 * LLM-Ops (mirrors visionAdapter): retry+jitter per model (retry.ts),
 * degrade sonnet→haiku→friendly, response Zod-validated
 * (ProductMatchSchema), every attempt logged to llm_costs (recordLlmCost),
 * worker-process only (matchWorker). NEVER throws — returns `{matches:[]}`
 * on any failure / missing key so the claimer keeps manual claiming
 * (NFR-R2). Dev: invoke the `claude-api` skill before editing the call.
 */
import {
  PRODUCT_MATCH_JSON_SCHEMA,
  ProductMatchSchema,
  type ProductMatch,
} from "@/features/claiming/photoMatch";
import { MAX_PARSE_PAGES } from "@/features/parsing/schema";
import { recordLlmCost } from "@/lib/llm/costLog";
import { DEGRADATION_MODELS } from "@/lib/llm/models";
import {
  backoffWithJitterMs,
  buildAttemptPlan,
  isRetryableStatus,
} from "@/lib/llm/retry";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_TOKENS = 4_000;

const SYSTEM_INSTRUCTION =
  "你是收據認領助手。會給你幾張使用者拿走的實體商品照片，以及同一張收據的逐行品項清單（每筆有 lineNo 與品名）。" +
  "判斷清單上【每一個 lineNo】的品項是否出現在照片中，以及你的把握度。" +
  "輸出 matches：對每個輸入 lineNo 回一筆 {lineNo（原樣帶回）, present（照片是否看得到該品項，布林）, confidence（0~1）}。" +
  "只對清單裡出現的 lineNo 作答，不要自創 lineNo。包裝外語沒關係，用品名語意比對。" +
  "只輸出符合 JSON schema 的結果，不要加任何解釋或引用標記。";

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

type MediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
function mediaType(m: string | undefined): MediaType {
  if (m === "image/png") return "image/png";
  if (m === "image/webp") return "image/webp";
  if (m === "image/gif") return "image/gif";
  return "image/jpeg";
}

export interface ClaimableLine {
  lineNo: number;
  description: string;
}

/**
 * Match products in the photo(s) to claimable receipt lines. Best-effort:
 * returns validated `{matches}` or `{matches:[]}` on any failure / no key.
 * Never throws (NFR-R2).
 */
export async function matchProductsToLines(
  images: string[],
  mimeTypes: string[],
  lines: ClaimableLine[],
  sessionId: string,
): Promise<ProductMatch> {
  const EMPTY: ProductMatch = { matches: [] };
  if (
    images.length === 0 ||
    images.length !== mimeTypes.length ||
    images.length > MAX_PARSE_PAGES ||
    lines.length === 0 ||
    images.some((d) => !d || d.length === 0)
  ) {
    return EMPTY;
  }

  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[matchProductsAdapter] OPENROUTER_API_KEY not set — skip match (manual claim still works).",
    );
    return EMPTY;
  }

  const attribution: Record<string, string> = {};
  if (process.env.OPENROUTER_SITE_URL) {
    attribution["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  }
  if (process.env.OPENROUTER_SITE_NAME) {
    attribution["X-Title"] = process.env.OPENROUTER_SITE_NAME;
  }

  const linesText = JSON.stringify({
    lines: lines.map((l) => ({ lineNo: l.lineNo, description: l.description })),
  });
  const content = [
    {
      type: "text" as const,
      text: `收據逐行品項清單：${linesText}\n判斷下列照片中各品項對應到哪些 lineNo。`,
    },
    ...images.map((data, i) => ({
      type: "image_url" as const,
      image_url: { url: `data:${mediaType(mimeTypes[i])};base64,${data}` },
    })),
  ];

  const plan = buildAttemptPlan(DEGRADATION_MODELS);

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
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_match",
              strict: true,
              schema: PRODUCT_MATCH_JSON_SCHEMA,
            },
          },
        }),
      });
      const latency = Date.now() - startedAt;

      if (!resp.ok) {
        await resp.text().catch(() => "");
        await recordLlmCost(sessionId, model, null, latency, false);
        if (resp.status === 401 || resp.status === 403) return EMPTY;
        if (isRetryableStatus(resp.status)) {
          if (i < plan.length - 1) {
            await new Promise((r) => setTimeout(r, backoffWithJitterMs(attempt)));
          }
          continue;
        }
        // Non-retryable → jump to the next model in the chain.
        const next = plan.findIndex((s, j) => j > i && s.model !== model);
        if (next === -1) break;
        i = next - 1;
        continue;
      }

      const body = (await resp.json()) as OpenRouterResponse;
      const raw = body.choices?.[0]?.message?.content ?? "";
      try {
        const parsed = ProductMatchSchema.parse(JSON.parse(raw));
        await recordLlmCost(sessionId, model, body.usage ?? null, latency, true);
        return parsed;
      } catch {
        await recordLlmCost(sessionId, model, body.usage ?? null, latency, false);
        continue;
      }
    } catch (err) {
      const latency = Date.now() - startedAt;
      await recordLlmCost(sessionId, model, null, latency, false);
      console.warn(
        "[matchProductsAdapter] network error:",
        err instanceof Error ? err.message : String(err),
      );
      if (i < plan.length - 1) {
        await new Promise((r) => setTimeout(r, backoffWithJitterMs(attempt)));
      }
      continue;
    }
  }

  return EMPTY; // exhausted — manual claim still works (NFR-R2)
}
