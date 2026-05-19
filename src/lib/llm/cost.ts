/**
 * Pure LLM cost computation (Story 1.4, NFR-L3). NO IO — node-testable.
 * Rates: USD per 1M tokens (claude-api skill model table). Cache write
 * = 1.25× input (5-min TTL), cache read = 0.1× input. Result rounded to
 * 6 decimals to match `llm_costs.cost_usd numeric(10,6)`.
 */
export const MODEL_PRICING: Record<
  string,
  { inUsdPerMTok: number; outUsdPerMTok: number }
> = {
  "claude-sonnet-4-6": { inUsdPerMTok: 3, outUsdPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inUsdPerMTok: 1, outUsdPerMTok: 5 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Compute cost in USD for one Claude call. Unknown model → 0 (the call
 * is still logged to llm_costs for telemetry; cost just can't be
 * priced — non-fatal, never throws).
 */
/** Non-negative finite token count; negative / NaN / undefined → 0
 *  (a negative or NaN usage value must never yield a negative cost). */
function tok(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

export function computeCostUsd(model: string, u: TokenUsage): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  const M = 1_000_000;
  const input = (tok(u.inputTokens) * p.inUsdPerMTok) / M;
  const cacheWrite =
    (tok(u.cacheCreationInputTokens) * p.inUsdPerMTok * 1.25) / M;
  const cacheRead =
    (tok(u.cacheReadInputTokens) * p.inUsdPerMTok * 0.1) / M;
  const output = (tok(u.outputTokens) * p.outUsdPerMTok) / M;
  return Math.round((input + cacheWrite + cacheRead + output) * 1e6) / 1e6;
}
