import { describe, expect, it } from "vitest";

import {
  MATCH_CONFIDENCE_THRESHOLD,
  ProductMatchSchema,
  pickConfidentMatches,
} from "@/features/claiming/photoMatch";

describe("ProductMatchSchema", () => {
  it("accepts a well-formed match payload", () => {
    expect(
      ProductMatchSchema.parse({
        matches: [{ lineNo: 1, present: true, confidence: 0.92 }],
      }).matches.length,
    ).toBe(1);
  });

  it("rejects junk (bad lineNo / out-of-range confidence / wrong types)", () => {
    expect(() =>
      ProductMatchSchema.parse({ matches: [{ lineNo: 0, present: true, confidence: 0.5 }] }),
    ).toThrow();
    expect(() =>
      ProductMatchSchema.parse({ matches: [{ lineNo: 1, present: true, confidence: 1.5 }] }),
    ).toThrow();
    expect(() =>
      ProductMatchSchema.parse({ matches: [{ lineNo: 1, present: "yes", confidence: 0.5 }] }),
    ).toThrow();
  });
});

describe("pickConfidentMatches", () => {
  const claimable = [1, 2, 3, 4]; // non-IRC claimable lines

  it("splits present matches by the confidence threshold", () => {
    const { autoClaim, needsConfirm } = pickConfidentMatches(
      [
        { lineNo: 1, present: true, confidence: 0.9 }, // auto
        { lineNo: 2, present: true, confidence: 0.6 }, // auto (== threshold)
        { lineNo: 3, present: true, confidence: 0.4 }, // confirm
      ],
      claimable,
    );
    expect(autoClaim).toEqual([1, 2]);
    expect(needsConfirm).toEqual([3]);
  });

  it("ignores absent items", () => {
    const r = pickConfidentMatches(
      [{ lineNo: 1, present: false, confidence: 0.99 }],
      claimable,
    );
    expect(r.autoClaim).toEqual([]);
    expect(r.needsConfirm).toEqual([]);
  });

  it("drops hallucinated / non-claimable lineNos", () => {
    const r = pickConfidentMatches(
      [
        { lineNo: 99, present: true, confidence: 0.95 }, // not in claimable
        { lineNo: 2, present: true, confidence: 0.95 },
      ],
      claimable,
    );
    expect(r.autoClaim).toEqual([2]);
  });

  it("dedupes repeated lineNos (first wins)", () => {
    const r = pickConfidentMatches(
      [
        { lineNo: 1, present: true, confidence: 0.95 },
        { lineNo: 1, present: true, confidence: 0.3 },
      ],
      claimable,
    );
    expect(r.autoClaim).toEqual([1]);
    expect(r.needsConfirm).toEqual([]);
  });

  it("uses MATCH_CONFIDENCE_THRESHOLD by default", () => {
    const r = pickConfidentMatches(
      [{ lineNo: 1, present: true, confidence: MATCH_CONFIDENCE_THRESHOLD - 0.01 }],
      claimable,
    );
    expect(r.autoClaim).toEqual([]);
    expect(r.needsConfirm).toEqual([1]);
  });
});
