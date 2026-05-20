import { describe, expect, it } from "vitest";

import { formatCents } from "@/features/reconciliation/lib/formatCents";

describe("formatCents — integer-cents → NT$ string", () => {
  it("zero", () => {
    expect(formatCents(0)).toBe("NT$0.00");
  });

  it("small positive < 100", () => {
    expect(formatCents(7)).toBe("NT$0.07");
    expect(formatCents(99)).toBe("NT$0.99");
  });

  it("hundreds with two decimals", () => {
    expect(formatCents(220850)).toBe("NT$2,208.50");
    expect(formatCents(100)).toBe("NT$1.00");
    expect(formatCents(123_456)).toBe("NT$1,234.56");
  });

  it("thousand separators on large values", () => {
    expect(formatCents(1_000_000)).toBe("NT$10,000.00");
    expect(formatCents(123_456_789)).toBe("NT$1,234,567.89");
  });

  it("negative values carry minus sign before prefix", () => {
    expect(formatCents(-220850)).toBe("-NT$2,208.50");
    expect(formatCents(-7)).toBe("-NT$0.07");
  });

  it("signed:true prefixes + on positive", () => {
    expect(formatCents(850, { signed: true })).toBe("+NT$8.50");
    expect(formatCents(0, { signed: true })).toBe("NT$0.00");
    expect(formatCents(-850, { signed: true })).toBe("-NT$8.50");
  });

  it("non-finite degrades gracefully (NFR-R1: never crash UI)", () => {
    expect(formatCents(Number.NaN)).toBe("NT$—");
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe("NT$—");
  });

  it("non-integer cents degrades to em-dash (review P1, money guardrail)", () => {
    // Fractional cents must NOT silently truncate — they would mask
    // an upstream bug. Fail-loud em-dash matches non-finite behaviour.
    expect(formatCents(0.5)).toBe("NT$—");
    expect(formatCents(-150.7)).toBe("NT$—");
    expect(formatCents(99.99)).toBe("NT$—");
  });

  it("custom prefix is respected", () => {
    expect(formatCents(220850, { prefix: "$" })).toBe("$2,208.50");
  });
});
