import { describe, expect, it } from "vitest";

import { attributeIrc, computeParsedSum } from "@/features/parsing/irc";
import type { ParsedReceipt } from "@/features/parsing/schema";

const line = (
  description: string,
  amountCents: number,
  rawText?: string,
  qty = 1,
) => ({ description, amountCents, rawText, qty });

/** Σ all original gross — the conservation truth parsed_sum must equal. */
const grossSum = (r: ParsedReceipt) =>
  r.lines.reduce((a, l) => a + l.amountCents, 0);

/** Decomposition the spec defines: Σ claimable net + Σ orphan-IRC gross. */
const decomposed = (r: ParsedReceipt) => {
  const a = attributeIrc(r);
  const claimableNet = a.lines
    .filter((l) => l.claimable)
    .reduce((s, l) => s + l.netCents, 0);
  const orphanIrc = a.lines
    .filter((l) => l.isIrc && l.orphan)
    .reduce((s, l) => s + l.grossCents, 0);
  return claimableNet + orphanIrc;
};

describe("attributeIrc — single IRC folds into its parent (AC1/AC2)", () => {
  const r: ParsedReceipt = {
    lines: [
      line("每一克巧克力牛乳", 4490, "8511322 1x 44.90"),
      line("IRC", -900, "IRC #8511322"),
      line("氣泡蘋果汁汽水", 9990, "8500664 1x 99.90"),
    ],
  };
  const a = attributeIrc(r);
  it("parent net = gross + IRC; IRC not claimable; attributed to parent", () => {
    expect(a.lines[0].netCents).toBe(4490 - 900);
    expect(a.lines[1].isIrc).toBe(true);
    expect(a.lines[1].claimable).toBe(false);
    expect(a.lines[1].ircAttributedTo).toBe(1);
    expect(a.lines[1].orphan).toBe(false);
    expect(a.lines[2].netCents).toBe(9990); // untouched normal line
  });
  it("parsed_sum == Σ gross == decomposition (conservation)", () => {
    expect(computeParsedSum(a)).toBe(grossSum(r));
    expect(decomposed(r)).toBe(grossSum(r));
  });
});

describe("multi-IRC same parent accumulate (AC1)", () => {
  const r: ParsedReceipt = {
    lines: [
      line("X", 10000, "777001 1x 100.00"),
      line("IRC", -500, "IRC #777001"),
      line("IRC", -300, "#777001 IRC"),
    ],
  };
  it("net = gross + both IRC", () => {
    const a = attributeIrc(r);
    expect(a.lines[0].netCents).toBe(10000 - 500 - 300);
    expect(computeParsedSum(a)).toBe(grossSum(r));
  });
});

describe("orphan IRC — kept, flagged, counted, never dropped (AC3/AC4)", () => {
  const r: ParsedReceipt = {
    lines: [line("Y", 5000, "111 1x 50.00"), line("IRC", -700, "IRC #999999")],
  };
  it("orphan flagged, attributed null, still in parsed_sum (conservation)", () => {
    const a = attributeIrc(r);
    expect(a.lines[1].orphan).toBe(true);
    expect(a.lines[1].ircAttributedTo).toBeNull();
    expect(a.lines[1].claimable).toBe(false);
    expect(a.lines[0].netCents).toBe(5000); // parent untouched
    expect(computeParsedSum(a)).toBe(5000 - 700);
    expect(decomposed(r)).toBe(grossSum(r));
  });
});

describe("positional fallback — code-less discount folds into the item above it", () => {
  // Korean/positional receipts: discount printed under its item, no #code.
  const r: ParsedReceipt = {
    lines: [
      line("農心 辛拉麵金", 9160, "농심 신라면골드"),
      line("促銷折扣", -920, "★행사상품"),
      line("Oreo 糖餅口味", 8960, "오레오 호떡맛"),
      line("餅乾促銷折扣", -1800, "과자 할인 행사"),
    ],
  };
  it("each code-less IRC attributes to the nearest preceding product; no orphans", () => {
    const a = attributeIrc(r);
    expect(a.lines[1].isIrc).toBe(true);
    expect(a.lines[1].orphan).toBe(false);
    expect(a.lines[1].ircAttributedTo).toBe(1); // 農心 lineNo
    expect(a.lines[0].netCents).toBe(9160 - 920);
    expect(a.lines[3].ircAttributedTo).toBe(3); // Oreo lineNo
    expect(a.lines[2].netCents).toBe(8960 - 1800);
    expect(a.lines.filter((l) => l.orphan).length).toBe(0);
    expect(computeParsedSum(a)).toBe(grossSum(r));
    expect(decomposed(r)).toBe(grossSum(r));
  });

  it("code-less IRC with no product above it stays orphan", () => {
    const r2: ParsedReceipt = {
      lines: [line("折扣", -100, "★할인"), line("X", 500, "x")],
    };
    const a = attributeIrc(r2);
    expect(a.lines[0].orphan).toBe(true);
    expect(a.lines[0].ircAttributedTo).toBeNull();
  });
});

describe("edges: no IRC / all IRC / empty / cross-page order", () => {
  it("no IRC → identity (net == gross)", () => {
    const r: ParsedReceipt = {
      lines: [line("A", 100, "1 1x 1"), line("B", 200, "2 1x 2")],
    };
    const a = attributeIrc(r);
    expect(a.lines.every((l) => l.netCents === l.grossCents && l.claimable)).toBe(
      true,
    );
    expect(computeParsedSum(a)).toBe(300);
  });
  it("empty receipt → parsed_sum 0", () => {
    expect(computeParsedSum(attributeIrc({ lines: [] }))).toBe(0);
  });
  it("all IRC (no parents) → all orphan, conservation holds", () => {
    const r: ParsedReceipt = {
      lines: [line("IRC", -100, "IRC #1"), line("IRC", -200, "IRC #2")],
    };
    const a = attributeIrc(r);
    expect(a.lines.every((l) => l.isIrc && l.orphan && !l.claimable)).toBe(true);
    expect(computeParsedSum(a)).toBe(-300);
  });
  it("cross-page order independence (match by code, not position)", () => {
    const ordered: ParsedReceipt = {
      lines: [line("P", 1000, "555 1x 10"), line("IRC", -100, "IRC #555")],
    };
    const shuffled: ParsedReceipt = {
      lines: [line("IRC", -100, "IRC #555"), line("P", 1000, "555 1x 10")],
    };
    const fold = (r: ParsedReceipt) =>
      attributeIrc(r).lines.find((l) => !l.isIrc)!.netCents;
    expect(fold(ordered)).toBe(900);
    expect(fold(shuffled)).toBe(900);
  });
});

describe("integer-cents only (no float) + conservation invariant", () => {
  it("all net/parsed values are integers", () => {
    const r: ParsedReceipt = {
      lines: [line("A", 1650, "8517238 1x 16.50"), line("IRC", -333, "IRC #8517238")],
    };
    const a = attributeIrc(r);
    for (const l of a.lines)
      expect(Number.isInteger(l.netCents) && Number.isInteger(l.grossCents)).toBe(
        true,
      );
    expect(Number.isInteger(computeParsedSum(a))).toBe(true);
  });
});

describe("#5564 STRUCTURE CONTRACT — SYNTHETIC, not real OCR data", () => {
  // ⚠️ Constructed input proving the IRC algorithm on a #5564-shaped
  // receipt (28 lines incl. 3 IRC) nets to the placeholder contract
  // 220850 (NT$2208.50). This is NOT parsed/OCR data — real #5564
  // end-to-end accuracy stays gated W-1-4-1 (no key) / W-CR-5
  // (multi-page n=0). It only verifies the math, honestly labelled.
  const parents = Array.from({ length: 25 }, (_, i) =>
    line(`item${i}`, 9234, `${1000 + i} 1x 92.34`),
  );
  // 25 * 9234 = 230850 ; 3 IRC referencing 3 of those parents = -10000
  const irc = [
    line("IRC", -4000, "IRC #1000"),
    line("IRC", -3500, "#1001 IRC"),
    line("IRC", -2500, "IRC #1002"),
  ];
  const r: ParsedReceipt = { lines: [...parents, ...irc] };

  it("28 lines incl 3 IRC; parsed_sum == 220850 == Σ gross == decomposition", () => {
    expect(r.lines.length).toBe(28);
    const a = attributeIrc(r);
    expect(a.lines.filter((l) => l.isIrc).length).toBe(3);
    expect(a.lines.filter((l) => l.orphan).length).toBe(0);
    expect(a.lines[0].netCents).toBe(9234 - 4000); // parent #1000
    expect(computeParsedSum(a)).toBe(220850);
    expect(grossSum(r)).toBe(220850);
    expect(decomposed(r)).toBe(220850);
  });
});
