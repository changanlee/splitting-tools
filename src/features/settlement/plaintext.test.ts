import { describe, expect, it } from "vitest";

import { buildSettlementText } from "@/features/settlement/plaintext";

describe("buildSettlementText — plain text export (Story 5.3)", () => {
  it("renders names + cents in order, no pending/orphan if zero (TWD)", () => {
    const out = buildSettlementText({
      parsedSumCents: 220850,
      printedTotalCents: 220850,
      unverified: false,
      currency: "TWD",
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

  it("renders CNY with ¥ prefix when sessions.currency=CNY", () => {
    const out = buildSettlementText({
      parsedSumCents: 220850,
      printedTotalCents: null,
      unverified: false,
      currency: "CNY",
      perIdentity: [{ name: "A", cents: 100000 }],
      pendingCents: 0,
      orphanIrcCents: 0,
    });
    expect(out).toContain("總額 ¥2,208.50");
    expect(out).toContain("A　¥1,000.00");
  });

  it("null currency → no prefix (degrade, never guess)", () => {
    const out = buildSettlementText({
      parsedSumCents: 1500,
      printedTotalCents: null,
      unverified: true,
      currency: null,
      perIdentity: [{ name: "A", cents: 1000 }],
      pendingCents: 500,
      orphanIrcCents: -100,
    });
    expect(out).toContain("⚠ 未經對帳驗證");
    expect(out).toContain("待認領 5.00");
    expect(out).toContain("孤兒 IRC -1.00");
  });

  it("renders ×N qty only when share weight ≥ 2 (default weight=1 stays silent)", () => {
    const out = buildSettlementText({
      parsedSumCents: 5000,
      printedTotalCents: 5000,
      unverified: false,
      currency: "CNY",
      perIdentity: [
        {
          name: "妮",
          cents: 2475,
          items: [
            { description: "渭美蜂蜜豆浆", cents: 1650, weight: 2 },
            { description: "每一克巧克力牛乳", cents: 825, weight: 1 },
          ],
        },
      ],
      pendingCents: 0,
      orphanIrcCents: 0,
    });
    expect(out).toContain("・渭美蜂蜜豆浆 ×2 ¥16.50");
    expect(out).toContain("・每一克巧克力牛乳 ¥8.25");
    expect(out).not.toContain("每一克巧克力牛乳 ×1");
  });

  it("missing weight (undefined) treated as 1 — no ×N noise", () => {
    const out = buildSettlementText({
      parsedSumCents: 1000,
      printedTotalCents: 1000,
      unverified: false,
      currency: "CNY",
      perIdentity: [
        {
          name: "A",
          cents: 1000,
          items: [{ description: "蓮雾", cents: 1000 }],
        },
      ],
      pendingCents: 0,
      orphanIrcCents: 0,
    });
    expect(out).toContain("・蓮雾 ¥10.00");
    expect(out).not.toContain("×");
  });

  it("zero claimers degrades gracefully", () => {
    const out = buildSettlementText({
      parsedSumCents: 1000,
      printedTotalCents: 1000,
      unverified: false,
      currency: "TWD",
      perIdentity: [],
      pendingCents: 1000,
      orphanIrcCents: 0,
    });
    expect(out).toContain("（尚無人認領）");
  });
});
