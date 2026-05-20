import { describe, expect, it } from "vitest";

import { generateLinkId, isValidLinkId } from "@/lib/linkId";

describe("generateLinkId — crypto-random 16-byte base64url", () => {
  it("returns a 22-char base64url string", () => {
    const id = generateLinkId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).toHaveLength(22);
  });

  it("collisions are astronomically rare — 100 ids are all distinct", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateLinkId());
    expect(ids.size).toBe(100);
  });
});

describe("isValidLinkId — shape guard (closes W-2-1-3)", () => {
  it("accepts a freshly-generated id", () => {
    expect(isValidLinkId(generateLinkId())).toBe(true);
  });

  it("rejects empty, wrong length, wrong charset, non-string", () => {
    expect(isValidLinkId("")).toBe(false);
    expect(isValidLinkId("short")).toBe(false);
    expect(isValidLinkId("a".repeat(21))).toBe(false);
    expect(isValidLinkId("a".repeat(23))).toBe(false);
    expect(isValidLinkId("invalid!!characters###")).toBe(false);
    expect(isValidLinkId(null)).toBe(false);
    expect(isValidLinkId(undefined)).toBe(false);
    expect(isValidLinkId(12345)).toBe(false);
  });

  it("accepts a known-good base64url shape", () => {
    expect(isValidLinkId("abcdEFGH_-0123456789_X")).toBe(true);
  });
});
