import { describe, expect, it } from "vitest";

import type { ParsedReceipt } from "@/features/parsing/schema";
import {
  MAX_VERIFY_LINES,
  VerifiedTranslationSchema,
  hasForeignScript,
  mergeVerifiedDescriptions,
  pickLowConfidenceLines,
  verifiedLineNos,
} from "@/features/parsing/verify";

const line = (
  description: string,
  opts: Partial<ParsedReceipt["lines"][number]> = {},
): ParsedReceipt["lines"][number] => ({
  description,
  qty: 1,
  amountCents: 100,
  ...opts,
});

describe("pickLowConfidenceLines", () => {
  it("selects only low-confidence lines, with their array index", () => {
    const receipt: ParsedReceipt = {
      lines: [
        line("農心 辛拉麵", { descriptionConfidence: "high", rawText: "농심 신라면" }),
        line("宗家 炒泡菜", { descriptionConfidence: "low", rawText: "종가 볶음투어400g" }),
        line("可口可樂"), // no flag → trusted
        line("Inner Care 胃部保護", { descriptionConfidence: "low", rawText: "이너케어 위 프로텍트" }),
      ],
    };
    const picked = pickLowConfidenceLines(receipt);
    expect(picked.map((p) => p.index)).toEqual([1, 3]);
    expect(picked[0]).toEqual({
      index: 1,
      rawText: "종가 볶음투어400g",
      description: "宗家 炒泡菜",
    });
  });

  it("falls back to description when rawText is missing", () => {
    const receipt: ParsedReceipt = {
      lines: [line("某外語品", { descriptionConfidence: "low" })],
    };
    expect(pickLowConfidenceLines(receipt)[0].rawText).toBe("某外語品");
  });

  it("returns empty for an all-high / all-Chinese receipt (zero web spend)", () => {
    const receipt: ParsedReceipt = {
      lines: [line("牛奶", { descriptionConfidence: "high" }), line("麵包")],
    };
    expect(pickLowConfidenceLines(receipt)).toEqual([]);
  });

  it("caps at MAX_VERIFY_LINES, lowest index first", () => {
    const receipt: ParsedReceipt = {
      lines: Array.from({ length: MAX_VERIFY_LINES + 5 }, (_, i) =>
        line(`item${i}`, { descriptionConfidence: "low" }),
      ),
    };
    const picked = pickLowConfidenceLines(receipt);
    expect(picked).toHaveLength(MAX_VERIFY_LINES);
    expect(picked[0].index).toBe(0);
    expect(picked[picked.length - 1].index).toBe(MAX_VERIFY_LINES - 1);
  });

  it("also selects lines whose description still has foreign script, even if not flagged low", () => {
    const receipt: ParsedReceipt = {
      lines: [
        line("牛奶"), // clean, no flag → skip
        line("크라운 화이트하임", { descriptionConfidence: "high" }), // Korean leak despite "high"
        line("宗家 炒泡菜", { descriptionConfidence: "low" }), // low, clean
      ],
    };
    // Foreign-script line sorts first (definitely broken), then the low one.
    expect(pickLowConfidenceLines(receipt).map((p) => p.index)).toEqual([1, 2]);
  });

  it("foreign-script lines win the scarce cap over merely-low-confidence ones", () => {
    const lines = Array.from({ length: MAX_VERIFY_LINES }, (_, i) =>
      line(`item${i}`, { descriptionConfidence: "low" }),
    );
    lines.push(line("덴마크 하이요구르트")); // foreign, unflagged, last
    const picked = pickLowConfidenceLines({ lines });
    expect(picked).toHaveLength(MAX_VERIFY_LINES);
    expect(picked.map((p) => p.index)).toContain(lines.length - 1); // included despite being last
  });
});

describe("hasForeignScript", () => {
  it("flags Hangul and Japanese kana, not Chinese/English", () => {
    expect(hasForeignScript("크라운 화이트하임")).toBe(true); // Hangul
    expect(hasForeignScript("うまい棒 明太子")).toBe(true); // kana
    expect(hasForeignScript("皇冠 White Heim 威化餅")).toBe(false);
    expect(hasForeignScript("Activia 蘋果優格 320g")).toBe(false);
  });
});

describe("mergeVerifiedDescriptions", () => {
  const base: ParsedReceipt = {
    lines: [
      line("宗家 炒泡菜", { descriptionConfidence: "low" }),
      line("可口可樂"),
    ],
  };

  it("applies a verified name and reports the corrected index", () => {
    const { receipt, verifiedIndices } = mergeVerifiedDescriptions(base, [
      { index: 0, description: "宗家 韓式炒泡菜 400g" },
    ]);
    expect(receipt.lines[0].description).toBe("宗家 韓式炒泡菜 400g");
    expect([...verifiedIndices]).toEqual([0]);
    // Pure: original receipt untouched.
    expect(base.lines[0].description).toBe("宗家 炒泡菜");
  });

  it("ignores out-of-range indices, blanks, and no-op rewrites", () => {
    const { receipt, verifiedIndices } = mergeVerifiedDescriptions(base, [
      { index: 9, description: "越界" },
      { index: 1, description: "   " },
      { index: 0, description: "宗家 炒泡菜" }, // identical → not a fix
    ]);
    expect(verifiedIndices.size).toBe(0);
    expect(receipt.lines[1].description).toBe("可口可樂");
  });

  it("rejects a 'verified' result that is still foreign script (no apply, no badge)", () => {
    const { receipt, verifiedIndices } = mergeVerifiedDescriptions(base, [
      { index: 0, description: "종가 볶음김치투어 400g" }, // still Korean
    ]);
    expect(verifiedIndices.size).toBe(0);
    expect(receipt.lines[0].description).toBe("宗家 炒泡菜"); // unchanged
  });
});

describe("verifiedLineNos", () => {
  it("maps 0-based indices to 1-based lineNos (matches attributeIrc)", () => {
    expect([...verifiedLineNos(new Set([0, 2]))].sort()).toEqual([1, 3]);
  });
});

describe("VerifiedTranslationSchema", () => {
  it("accepts a well-formed verify payload, rejects junk", () => {
    expect(
      VerifiedTranslationSchema.parse({
        results: [{ index: 0, description: "農心 辛拉麵 Gold" }],
      }).results.length,
    ).toBe(1);
    expect(() =>
      VerifiedTranslationSchema.parse({ results: [{ index: -1, description: "x" }] }),
    ).toThrow();
  });
});
