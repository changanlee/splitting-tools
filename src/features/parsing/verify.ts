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
 * receipt. OBSERVED COST is brutal: one OpenRouter `web`-plugin call over
 * ~9 items pulled ~170–255K prompt tokens ≈ $0.7–0.9 (2026-06-21) — the
 * plugin injects full page text per item × max_results. So verify is the
 * EXPENSIVE exception now: pure-prompt translation (Pass 1) does the bulk
 * for ~free, and only a tiny number of still-uncertain items get
 * web-verified. Cap kept low to bound cost (~$0.1–0.3/receipt worst case).
 * Foreign-script (untranslated) lines are prioritised under the cap.
 */
export const MAX_VERIFY_LINES = 3;

/**
 * Detect characters that are definitely NOT Traditional Chinese and so
 * mean a name was left untranslated: Korean Hangul (syllables + jamo) and
 * Japanese kana. CJK ideographs are intentionally NOT matched — those are
 * Chinese (or shared Kanji), which is exactly what we want to keep.
 */
const FOREIGN_SCRIPT_RE = /[가-힣ᄀ-ᇿ㄰-㆏぀-ヿ]/;

export function hasForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT_RE.test(text);
}

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
 * Select the lines worth a web search: those the parser flagged
 * `descriptionConfidence === "low"`, PLUS any whose description still
 * contains untranslated foreign script (Pass-1 prompt non-compliance —
 * defense-in-depth). Foreign-script lines are definitely wrong, so they
 * sort first and win the scarce MAX_VERIFY_LINES slots. Lines that are
 * confident AND already pure-Chinese never spend a web search.
 */
export function pickLowConfidenceLines(
  receipt: ParsedReceipt,
): LowConfidenceLine[] {
  const candidates: Array<LowConfidenceLine & { foreign: boolean }> = [];
  receipt.lines.forEach((l, index) => {
    const foreign = hasForeignScript(l.description);
    if (l.descriptionConfidence !== "low" && !foreign) return;
    candidates.push({
      index,
      rawText: l.rawText && l.rawText.length > 0 ? l.rawText : l.description,
      description: l.description,
      foreign,
    });
  });
  // Foreign-script first (definitely broken), then original order. Array
  // sort is stable, so same-priority items keep their receipt order.
  candidates.sort((a, b) => Number(b.foreign) - Number(a.foreign));
  return candidates
    .slice(0, MAX_VERIFY_LINES)
    .map(({ index, rawText, description }) => ({ index, rawText, description }));
}

/**
 * Fold verified names back into a COPY of the receipt. Returns the new
 * receipt plus the set of indices actually corrected (drives
 * `description_verified`). Defensive against a noisy model: ignores
 * out-of-range indices, blank names, no-op rewrites, AND results that
 * STILL contain foreign script (a "correction" that's still Korean/kana
 * is not a correction — never apply it, never flash the 已查證 badge on it).
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
    if (hasForeignScript(name)) continue; // still untranslated → reject
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
