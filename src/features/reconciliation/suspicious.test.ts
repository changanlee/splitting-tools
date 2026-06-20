import { describe, expect, it } from "vitest";

import {
  buildSuspiciousContext,
  classifySuspicious,
} from "@/features/reconciliation/suspicious";
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";

const product = (
  overrides: Partial<ReceiptLineView> & Pick<ReceiptLineView, "lineNo">,
): ReceiptLineView => {
  const defaults: ReceiptLineView = {
    id: `id-${overrides.lineNo}`,
    lineNo: overrides.lineNo,
    description: "巧克力牛乳",
    rawText: null,
    descriptionVerified: false,
    qty: 1,
    shareCount: 1,
    grossCents: 9990,
    netCents: 9990,
    isIrc: false,
    claimable: true,
    ircAttributedTo: null,
    orphan: false,
  };
  return { ...defaults, ...overrides };
};

describe("classifySuspicious — share_ratio_outlier", () => {
  it("flags a line whose net is > 50% of total (≥3 product lines)", () => {
    const lines = [
      product({ lineNo: 1, netCents: 50000 }),
      product({ lineNo: 2, netCents: 10000 }),
      product({ lineNo: 3, netCents: 5000 }),
    ];
    const ctx = buildSuspiciousContext(lines);
    expect(classifySuspicious(lines[0], ctx).flags).toContain(
      "share_ratio_outlier",
    );
    expect(classifySuspicious(lines[1], ctx).flags).not.toContain(
      "share_ratio_outlier",
    );
  });

  it("does NOT flag when productLineCount < 3 (tiny receipts)", () => {
    const lines = [
      product({ lineNo: 1, netCents: 90000 }),
      product({ lineNo: 2, netCents: 1000 }),
    ];
    const ctx = buildSuspiciousContext(lines);
    expect(classifySuspicious(lines[0], ctx).flags).not.toContain(
      "share_ratio_outlier",
    );
  });

  it("guards divide-by-zero when total is 0", () => {
    const lines = [
      product({ lineNo: 1, netCents: 0 }),
      product({ lineNo: 2, netCents: 0 }),
      product({ lineNo: 3, netCents: 0 }),
    ];
    const ctx = buildSuspiciousContext(lines);
    expect(classifySuspicious(lines[0], ctx).flags).not.toContain(
      "share_ratio_outlier",
    );
  });
});

describe("classifySuspicious — description_unusual", () => {
  it("flags pure-symbol/digit descriptions", () => {
    const ctx = buildSuspiciousContext([]);
    const l = product({ lineNo: 1, description: "###  ???" });
    expect(classifySuspicious(l, ctx).flags).toContain("description_unusual");
  });

  it("does NOT flag descriptions with CJK", () => {
    const ctx = buildSuspiciousContext([]);
    const l = product({ lineNo: 1, description: "巧克力" });
    expect(classifySuspicious(l, ctx).flags).not.toContain(
      "description_unusual",
    );
  });

  it("does NOT flag descriptions with Latin letters", () => {
    const ctx = buildSuspiciousContext([]);
    const l = product({ lineNo: 1, description: "MILK 2L" });
    expect(classifySuspicious(l, ctx).flags).not.toContain(
      "description_unusual",
    );
  });

  it("does NOT flag IRC rows (legitimate short symbols)", () => {
    const ctx = buildSuspiciousContext([]);
    const irc = product({
      lineNo: 1,
      isIrc: true,
      claimable: false,
      description: "IRC",
      grossCents: -900,
      netCents: -900,
    });
    expect(classifySuspicious(irc, ctx).flags).not.toContain(
      "description_unusual",
    );
  });
});

describe("classifySuspicious — negative_non_irc (invariant break)", () => {
  it("flags negative amount on non-IRC line", () => {
    const ctx = buildSuspiciousContext([]);
    const bad = product({ lineNo: 1, grossCents: -500, netCents: -500 });
    expect(classifySuspicious(bad, ctx).flags).toContain("negative_non_irc");
  });

  it("does NOT flag IRC rows with legitimate negative amount", () => {
    const ctx = buildSuspiciousContext([]);
    const irc = product({
      lineNo: 1,
      isIrc: true,
      claimable: false,
      grossCents: -900,
      netCents: -900,
    });
    expect(classifySuspicious(irc, ctx).flags).not.toContain(
      "negative_non_irc",
    );
  });
});

describe("classifySuspicious — severity roll-up + multi-flag", () => {
  it("multiple flags compose; severity becomes 'suspicious'", () => {
    const lines = [
      product({
        lineNo: 1,
        description: "###",
        netCents: 60000,
      }),
      product({ lineNo: 2, netCents: 5000 }),
      product({ lineNo: 3, netCents: 5000 }),
    ];
    const ctx = buildSuspiciousContext(lines);
    const r = classifySuspicious(lines[0], ctx);
    expect(r.severity).toBe("suspicious");
    expect(r.flags).toEqual(
      expect.arrayContaining(["share_ratio_outlier", "description_unusual"]),
    );
  });

  it("zero flags → severity 'normal'", () => {
    const ctx = buildSuspiciousContext([
      product({ lineNo: 1, netCents: 5000 }),
      product({ lineNo: 2, netCents: 5000 }),
      product({ lineNo: 3, netCents: 5000 }),
    ]);
    const fine = product({ lineNo: 1, netCents: 5000 });
    const r = classifySuspicious(fine, ctx);
    expect(r.severity).toBe("normal");
    expect(r.flags).toEqual([]);
  });
});
