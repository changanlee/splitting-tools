/**
 * Photo-assisted claim — pure matching helpers (Story 8.1, Phase 1).
 *
 * PURE, NO IO — fully node-testable. The vision call lives in the LLM
 * boundary (`src/lib/llm/matchProductsAdapter.ts`); the output contract
 * and the confidence selection live here so they can be unit-tested
 * without a network/key.
 *
 * Flow (matchWorker): a user photographs the physical products they took;
 * the boundary returns, per receipt line, whether the model sees it in the
 * photo and how confident it is. `pickConfidentMatches` splits those into
 * lines to AUTO-claim (high confidence) vs lines to surface for manual
 * confirmation (present but uncertain). Whole-line only in Phase 1 — no
 * per-unit quantity (deferred to Phase 2).
 */
import { z } from "zod";

/**
 * Confidence floor for auto-claiming. Matching a physical package photo to
 * a receipt's text line is inherently noisy, so the bar is deliberately
 * conservative: only clearly-present items are auto-claimed, everything
 * else is "confirm manually" — the result is a draft, never final.
 */
export const MATCH_CONFIDENCE_THRESHOLD = 0.6;

/** Pass-2 (vision match) LLM output contract — Zod-validated at the boundary. */
export const ProductMatchSchema = z.object({
  matches: z.array(
    z.object({
      /** 1-based receipt line number (matches receipt_lines.line_no). */
      lineNo: z.number().int().positive(),
      /** Does the model see this line's item in the photo? */
      present: z.boolean(),
      /** Model's confidence in `present` (0..1). */
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type ProductMatch = z.infer<typeof ProductMatchSchema>;

/**
 * JSON Schema for OpenRouter `response_format` (strict). Hand-written to
 * stay independent of any SDK↔zod coupling; the response is STILL
 * re-validated by ProductMatchSchema (defense-in-depth).
 */
export const PRODUCT_MATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lineNo: { type: "integer" },
          present: { type: "boolean" },
          confidence: { type: "number" },
        },
        required: ["lineNo", "present", "confidence"],
      },
    },
  },
  required: ["matches"],
} as const;

export interface MatchSelection {
  /** present && confidence ≥ threshold && a real claimable line → auto-claim. */
  autoClaim: number[];
  /** present but below threshold → surface for one-tap manual confirm. */
  needsConfirm: number[];
}

/**
 * Split the model's matches into auto-claim vs needs-confirm, defensively:
 * drops absent items, hallucinated / non-claimable lineNos (not in
 * `claimableLineNos`), and duplicate lineNos (first wins). Returns lineNos
 * only — Phase 1 claims whole lines.
 */
export function pickConfidentMatches(
  matches: ProductMatch["matches"],
  claimableLineNos: Iterable<number>,
  threshold: number = MATCH_CONFIDENCE_THRESHOLD,
): MatchSelection {
  const valid = new Set(claimableLineNos);
  const autoClaim: number[] = [];
  const needsConfirm: number[] = [];
  const seen = new Set<number>();

  for (const m of matches) {
    if (!m.present) continue;
    if (!valid.has(m.lineNo)) continue; // hallucinated / non-claimable
    if (seen.has(m.lineNo)) continue; // dedupe, first wins
    seen.add(m.lineNo);
    if (m.confidence >= threshold) autoClaim.push(m.lineNo);
    else needsConfirm.push(m.lineNo);
  }

  return { autoClaim, needsConfirm };
}
