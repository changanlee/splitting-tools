/**
 * recordLlmCost — the ONE structured cost-logger for every LLM call
 * (NFR-L3/L5, P0). Both the vision parse (visionAdapter) and the
 * translation web-verify (verifyTranslations) write through here so the
 * `llm_costs` row shape can never drift between call sites.
 *
 * Best-effort by contract: telemetry must NEVER mask or break the call's
 * outcome — a failed insert is logged and swallowed. PII-safe: only
 * model / token counts / latency / cost / session id / success are
 * stored; prompts and images are never logged (NFR-S3).
 */
import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/client";
import { llmCosts } from "@/db/schema";
import { computeCostUsd } from "@/lib/llm/cost";

/** The subset of an OpenRouter `usage` object we persist. OpenRouter
 *  extends OpenAI's shape with an optional `cost` (final USD incl. their
 *  markup) — preferred over our static table when present. */
export interface LlmUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cost?: number | null;
}

export async function recordLlmCost(
  sessionId: string,
  model: string,
  usage: LlmUsage | null,
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
      sessionId,
      requestId: randomUUID(),
      model,
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      latencyMs,
      costUsd: costUsd.toFixed(6),
      success,
    });
  } catch (e) {
    console.error("[recordLlmCost] llm_costs write failed:", e);
  }
}
