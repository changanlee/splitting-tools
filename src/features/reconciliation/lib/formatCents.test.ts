import { describe, expect, it } from "vitest";

import { formatCents } from "@/features/reconciliation/lib/formatCents";

describe("formatCents — integer-cents → money string", () => {
  it("no currency, no prefix (default behaviour)", () => {
    expect(formatCents(0)).toBe("0.00");
    expect(formatCents(220850)).toBe("2,208.50");
    expect(formatCents(-7)).toBe("-0.07");
  });

  it("currency=TWD → NT$ prefix", () => {
    expect(formatCents(220850, { currency: "TWD" })).toBe("NT$2,208.50");
    expect(formatCents(7, { currency: "TWD" })).toBe("NT$0.07");
  });

  it("currency=CNY → ¥ prefix", () => {
    expect(formatCents(220850, { currency: "CNY" })).toBe("¥2,208.50");
  });

  it("currency=USD → US$ prefix", () => {
    expect(formatCents(220850, { currency: "USD" })).toBe("US$2,208.50");
  });

  it("currency code is case-insensitive", () => {
    expect(formatCents(100, { currency: "cny" })).toBe("¥1.00");
  });

  it("unknown currency code → no prefix (degrade, do not guess)", () => {
    expect(formatCents(220850, { currency: "ZZZ" })).toBe("2,208.50");
  });

  it("currency=null / empty string → no prefix", () => {
    expect(formatCents(220850, { currency: null })).toBe("2,208.50");
    expect(formatCents(220850, { currency: "" })).toBe("2,208.50");
  });

  it("thousand separators on large values", () => {
    expect(formatCents(1_000_000, { currency: "CNY" })).toBe("¥10,000.00");
    expect(formatCents(123_456_789, { currency: "CNY" })).toBe(
      "¥1,234,567.89",
    );
  });

  it("negative values carry minus before prefix", () => {
    expect(formatCents(-220850, { currency: "CNY" })).toBe("-¥2,208.50");
    expect(formatCents(-220850, { currency: "TWD" })).toBe("-NT$2,208.50");
  });

  it("signed:true prefixes + on positive", () => {
    expect(formatCents(850, { currency: "CNY", signed: true })).toBe("+¥8.50");
    expect(formatCents(0, { currency: "CNY", signed: true })).toBe("¥0.00");
    expect(formatCents(-850, { currency: "CNY", signed: true })).toBe(
      "-¥8.50",
    );
  });

  it("non-finite degrades gracefully (NFR-R1: never crash UI)", () => {
    expect(formatCents(Number.NaN, { currency: "CNY" })).toBe("¥—");
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("non-integer cents degrades to em-dash (money guardrail)", () => {
    expect(formatCents(0.5, { currency: "CNY" })).toBe("¥—");
    expect(formatCents(-150.7)).toBe("—");
  });

  it("explicit prefix wins when currency not set", () => {
    expect(formatCents(220850, { prefix: "$" })).toBe("$2,208.50");
  });

  it("currency wins over explicit prefix", () => {
    expect(formatCents(220850, { currency: "CNY", prefix: "$" })).toBe(
      "¥2,208.50",
    );
  });
});
