import { describe, expect, it } from "vitest";

import { buildSettlementText } from "@/features/settlement/plaintext";

describe("buildSettlementText — plain text export (Story 5.3)", () => {
  it("renders names + cents in order, no pending/orphan if zero", () => {
    const out = buildSettlementText({
      parsedSumCents: 220850,
      printedTotalCents: 220850,
      unverified: false,
      perIdentity: [
        { name: "美", cents: 150000 },
        { name: "哲", cents: 70850 },
      ],
      pendingCents: 0,
      orphanIrcCents: 0,
    });
    expect(out).toContain("📑 這次的分帳");
    expect(out).toContain("總額 NT$2,208.50");
    expect(out).toContain("美　NT$1,500.00");
    expect(out).toContain("哲　NT$708.50");
    expect(out).not.toContain("待認領");
    expect(out).not.toContain("孤兒 IRC");
  });

  it("renders unverified warning and pending/orphan when present", () => {
    const out = buildSettlementText({
      parsedSumCents: 1500,
      printedTotalCents: null,
      unverified: true,
      perIdentity: [{ name: "A", cents: 1000 }],
      pendingCents: 500,
      orphanIrcCents: -100,
    });
    expect(out).toContain("⚠ 未經對帳驗證");
    expect(out).toContain("待認領 NT$5.00");
    expect(out).toContain("孤兒 IRC -NT$1.00");
  });

  it("zero claimers degrades gracefully", () => {
    const out = buildSettlementText({
      parsedSumCents: 1000,
      printedTotalCents: 1000,
      unverified: false,
      perIdentity: [],
      pendingCents: 1000,
      orphanIrcCents: 0,
    });
    expect(out).toContain("（尚無人認領）");
  });
});
