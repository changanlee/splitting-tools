/**
 * Translation-verification helpers — 2026-06-20 foreign-receipt feature.
 *
 * PURE, NO IO — fully node-testable. The web-search LLM call lives in the
 * LLM boundary (`src/lib/llm/verifyTranslations.ts`); the selection and
 * merge maths live here so they can be unit-tested without a network/key.
 *
 * Flow (parseWorker, Pass 2): the vision parse (Pass 1) tags each line
 * with `descriptionConfidence`. `pickLowConfidenceLines` selects the
 * `"low"` ones; the boundary web-verifies their official Traditional-
 * Chinese names; `mergeVerifiedDescriptions` folds the verified names
 * back in and reports WHICH lines were actually corrected (so persist can
 * stamp `description_verified`). Anything not verified silently keeps its
 * Pass-1 translation — never blocks (NFR-R2).
 */
import { z } from "zod";

import type { ParsedReceipt } from "@/features/parsing/schema";

/**
 * Hard cap on lines sent to the (paid, web-search) verify pass per
 * receipt. A pathological all-foreign receipt must not fan out an
 * unbounded number of web searches (LLM non-negotiable #2/#7 cost
 * discipline). MAX_PARSE_PAGES=5 already bounds total lines to dozens;
 * this is the belt-and-braces ceiling. Lowest-index lines win.
 */
export const MAX_VERIFY_LINES = 15;

/** One line eligible for web verification (index into `receipt.lines`). */
export interface LowConfidenceLine {
  /** 0-based position in `ParsedReceipt.lines` — the stable join key. */
  index: number;
  /** Original receipt text (foreign-language); falls back to the
   *  tentative description when the parser omitted rawText. */
  rawText: string;
  /** Pass-1 tentative Traditional-Chinese translation. */
  description: string;
}

/** Pass-2 LLM output contract (Zod-validated at the boundary). */
export const VerifiedTranslationSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      description: z.string(),
    }),
  ),
});
export type VerifiedTranslation = z.infer<typeof VerifiedTranslationSchema>;

/**
 * Select the lines the parser flagged `descriptionConfidence === "low"`,
 * capped at MAX_VERIFY_LINES (lowest index first). Lines without the flag
 * (absent / "high") are trusted and never spend a web search.
 */
export function pickLowConfidenceLines(
  receipt: ParsedReceipt,
): LowConfidenceLine[] {
  const out: LowConfidenceLine[] = [];
  receipt.lines.forEach((l, index) => {
    if (l.descriptionConfidence !== "low") return;
    out.push({
      index,
      rawText: l.rawText && l.rawText.length > 0 ? l.rawText : l.description,
      description: l.description,
    });
  });
  return out.slice(0, MAX_VERIFY_LINES);
}

/**
 * Fold verified names back into a COPY of the receipt. Returns the new
 * receipt plus the set of indices actually corrected (drives
 * `description_verified`). Defensive against a noisy model: ignores
 * out-of-range indices, blank names, and no-op rewrites (verified name
 * identical to the existing one is not a "correction").
 */
export function mergeVerifiedDescriptions(
  receipt: ParsedReceipt,
  verified: VerifiedTranslation["results"],
): { receipt: ParsedReceipt; verifiedIndices: Set<number> } {
  const lines = receipt.lines.map((l) => ({ ...l }));
  const verifiedIndices = new Set<number>();

  for (const r of verified) {
    if (r.index < 0 || r.index >= lines.length) continue;
    const name = r.description.trim();
    if (name.length === 0) continue;
    if (name === lines[r.index].description) continue; // no-op, not a fix
    lines[r.index].description = name;
    verifiedIndices.add(r.index);
  }

  return { receipt: { ...receipt, lines }, verifiedIndices };
}

/**
 * Map verified 0-based receipt-line indices → 1-based `lineNo`s, matching
 * `attributeIrc` (which assigns `lineNo = i + 1` and preserves order). The
 * persist layer stamps `description_verified` on these lineNos.
 */
export function verifiedLineNos(verifiedIndices: Set<number>): Set<number> {
  return new Set([...verifiedIndices].map((i) => i + 1));
}
