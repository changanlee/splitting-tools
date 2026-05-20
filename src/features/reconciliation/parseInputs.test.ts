import { describe, expect, it } from "vitest";

import {
  parseCentsInput,
  parseDescription,
  parseQtyInput,
} from "@/features/reconciliation/parseInputs";

describe("parseCentsInput — integer cents from human input", () => {
  it("accepts integer dollars without decimal", () => {
    expect(parseCentsInput("100")).toBe(10000);
    expect(parseCentsInput("0")).toBe(0);
    expect(parseCentsInput("2208")).toBe(220800);
  });

  it("accepts 1- or 2-digit decimal cents", () => {
    expect(parseCentsInput("99.9")).toBe(9990);
    expect(parseCentsInput("2208.50")).toBe(220850);
    expect(parseCentsInput("0.07")).toBe(7);
  });

  it("strips NT$ prefix and thousand separators", () => {
    expect(parseCentsInput("NT$2,208.50")).toBe(220850);
    expect(parseCentsInput("nt$1,000")).toBe(100000);
    expect(parseCentsInput("  10,000.50  ")).toBe(1000050);
  });

  it("rejects empty / non-string / NaN-ish / scientific", () => {
    expect(parseCentsInput("")).toBeNull();
    expect(parseCentsInput("  ")).toBeNull();
    expect(parseCentsInput("abc")).toBeNull();
    expect(parseCentsInput("1e3")).toBeNull();
    // @ts-expect-error — runtime guard against non-string
    expect(parseCentsInput(123)).toBeNull();
  });

  it("rejects negative and >2 decimal digits", () => {
    expect(parseCentsInput("-100")).toBeNull();
    expect(parseCentsInput("100.555")).toBeNull();
    expect(parseCentsInput("0.999")).toBeNull();
  });
});

describe("parseQtyInput — strictly positive integer", () => {
  it("accepts positive integers", () => {
    expect(parseQtyInput("1")).toBe(1);
    expect(parseQtyInput(" 25 ")).toBe(25);
  });

  it("rejects zero / negative / non-integer / non-digit", () => {
    expect(parseQtyInput("0")).toBeNull();
    expect(parseQtyInput("-1")).toBeNull();
    expect(parseQtyInput("1.5")).toBeNull();
    expect(parseQtyInput("abc")).toBeNull();
    expect(parseQtyInput("")).toBeNull();
  });
});

describe("parseDescription — trim + length guard", () => {
  it("accepts 1..100 trimmed chars", () => {
    expect(parseDescription("巧克力牛乳")).toBe("巧克力牛乳");
    expect(parseDescription("  MILK 2L  ")).toBe("MILK 2L");
    expect(parseDescription("a".repeat(100))).toBe("a".repeat(100));
  });

  it("rejects empty / oversize", () => {
    expect(parseDescription("")).toBeNull();
    expect(parseDescription("   ")).toBeNull();
    expect(parseDescription("a".repeat(101))).toBeNull();
  });
});
