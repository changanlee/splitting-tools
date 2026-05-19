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
export function computeCostUsd(model: string, u: TokenUsage): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  const M = 1_000_000;
  const input = ((u.inputTokens || 0) * p.inUsdPerMTok) / M;
  const cacheWrite =
    ((u.cacheCreationInputTokens || 0) * p.inUsdPerMTok * 1.25) / M;
  const cacheRead =
    ((u.cacheReadInputTokens || 0) * p.inUsdPerMTok * 0.1) / M;
  const output = ((u.outputTokens || 0) * p.outUsdPerMTok) / M;
  return Math.round((input + cacheWrite + cacheRead + output) * 1e6) / 1e6;
}
