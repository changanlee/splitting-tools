import { describe, expect, it } from "vitest";

import {
  currencyDecimals,
  formatAmountPlain,
  formatCents,
} from "@/features/reconciliation/lib/formatCents";

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

  // 2026-06-21 currency-aware decimals (ISO 4217). KRW/JPY have NO minor
  // unit — the old code divided by 100 and showed ₩4,980 as ₩47.80.
  it("KRW is zero-decimal: integer won, no '.00', with separators", () => {
    expect(formatCents(132580, { currency: "KRW" })).toBe("₩132,580");
    expect(formatCents(4980, { currency: "KRW" })).toBe("₩4,980");
    expect(formatCents(-920, { currency: "KRW" })).toBe("-₩920");
    expect(formatCents(920, { currency: "KRW", signed: true })).toBe("+₩920");
  });

  it("JPY is zero-decimal too", () => {
    expect(formatCents(1200, { currency: "JPY" })).toBe("¥1,200");
  });

  it("3-decimal currency (KWD) shows three fraction digits", () => {
    expect(formatCents(1234, { currency: "KWD" })).toBe("1.234");
  });
});

describe("currencyDecimals — ISO 4217 minor units", () => {
  it("0 for KRW/JPY/VND, 2 default, 3 for KWD", () => {
    expect(currencyDecimals("KRW")).toBe(0);
    expect(currencyDecimals("jpy")).toBe(0);
    expect(currencyDecimals("VND")).toBe(0);
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("TWD")).toBe(2);
    expect(currencyDecimals(null)).toBe(2);
    expect(currencyDecimals("")).toBe(2);
    expect(currencyDecimals("ZZZ")).toBe(2);
    expect(currencyDecimals("KWD")).toBe(3);
  });
});

describe("formatAmountPlain — form round-trip (no prefix/separators)", () => {
  it("honours currency decimals", () => {
    expect(formatAmountPlain(4980, "KRW")).toBe("4980");
    expect(formatAmountPlain(1650, "USD")).toBe("16.50");
    expect(formatAmountPlain(220850, null)).toBe("2208.50");
    expect(formatAmountPlain(-920, "KRW")).toBe("-920");
    expect(formatAmountPlain(0.5, "USD")).toBe("");
  });
});
