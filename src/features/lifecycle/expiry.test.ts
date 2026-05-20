import { describe, expect, it } from "vitest";

import {
  EXPIRY_DAYS,
  MS_PER_DAY,
  expiresAt,
  isExpired,
} from "@/features/lifecycle/expiry";

describe("expiresAt — 30-day window (NFR-S4)", () => {
  it("created+30d", () => {
    const created = new Date("2026-05-20T00:00:00Z");
    expect(expiresAt(created)).toEqual(new Date("2026-06-19T00:00:00Z"));
  });
  it("EXPIRY_DAYS is exactly 30 (CI gate)", () => {
    expect(EXPIRY_DAYS).toBe(30);
    expect(MS_PER_DAY * EXPIRY_DAYS).toBe(2_592_000_000);
  });
});

describe("isExpired — boundary semantics", () => {
  const created = new Date("2026-05-20T00:00:00Z");
  it("not expired right after creation", () => {
    expect(isExpired(created, new Date("2026-05-20T01:00:00Z"))).toBe(false);
  });
  it("not expired one ms before the 30-day mark", () => {
    expect(
      isExpired(created, new Date(expiresAt(created).getTime() - 1)),
    ).toBe(false);
  });
  it("expired AT the 30-day mark (inclusive >= boundary)", () => {
    expect(isExpired(created, expiresAt(created))).toBe(true);
  });
  it("expired well after", () => {
    expect(isExpired(created, new Date("2027-01-01T00:00:00Z"))).toBe(true);
  });
});
