import { describe, expect, it } from "vitest";

import {
  PER_IP_DAILY_PAGES,
  PER_SESSION_DAILY_PAGES,
  RATE_WINDOW_MS,
  decideRateLimit,
  type RateCounterState,
} from "@/lib/rateLimit";

const W = RATE_WINDOW_MS;
const T0 = new Date("2026-05-20T00:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("decideRateLimit — fresh window when no prior counter (AC1)", () => {
  it("null current + pages → new window at now, count = pages", () => {
    const d = decideRateLimit(null, T0, 3, 40, W);
    expect(d).toEqual({ allow: true, newCount: 3, newWindowStart: T0 });
  });
});

describe("inherit window on subsequent calls within windowMs (AC1)", () => {
  it("count accumulates; windowStart preserved", () => {
    const prior: RateCounterState = { windowStart: T0, count: 5 };
    const d = decideRateLimit(prior, at(60_000), 2, 40, W);
    expect(d).toEqual({ allow: true, newCount: 7, newWindowStart: T0 });
  });
});

describe("reset window when expired (now - windowStart >= windowMs)", () => {
  it("expired window resets count to pages, windowStart = now", () => {
    const prior: RateCounterState = { windowStart: T0, count: 38 };
    const now = at(W); // exactly 24h later → expired
    const d = decideRateLimit(prior, now, 1, 40, W);
    expect(d).toEqual({ allow: true, newCount: 1, newWindowStart: now });
  });
});

describe("boundary: exactly at limit vs +1 over (AC1)", () => {
  it("count == limit → allow", () => {
    const prior: RateCounterState = { windowStart: T0, count: 35 };
    const d = decideRateLimit(prior, at(1000), 5, 40, W);
    expect(d.allow).toBe(true);
    expect(d.newCount).toBe(40);
  });
  it("count == limit + 1 → deny, retryAfter ≈ windowMs - elapsed", () => {
    const prior: RateCounterState = { windowStart: T0, count: 40 };
    const elapsed = 1000;
    const d = decideRateLimit(prior, at(elapsed), 1, 40, W);
    expect(d.allow).toBe(false);
    expect(d.newCount).toBe(41);
    expect(d.retryAfterMs).toBe(W - elapsed);
  });
});

describe("denied burst is still counted (fail-conservative)", () => {
  it("a denying call advances count past limit; subsequent calls remain denied", () => {
    const s1 = decideRateLimit({ windowStart: T0, count: 39 }, at(100), 5, 40, W);
    expect(s1.allow).toBe(false);
    expect(s1.newCount).toBe(44); // counted past limit
    // Same window, 100ms later: another small request still denied
    const prior2: RateCounterState = {
      windowStart: s1.newWindowStart,
      count: s1.newCount,
    };
    const s2 = decideRateLimit(prior2, at(200), 1, 40, W);
    expect(s2.allow).toBe(false);
    expect(s2.newCount).toBe(45);
  });
});

describe("retryAfterMs is non-negative and bounded by windowMs", () => {
  it("just-expired window denial would have retryAfterMs == windowMs (defensive ≥ 0)", () => {
    // The decision path that yields retryAfter is non-expired; this asserts
    // the bounded formula `max(0, windowMs - elapsed)` for various elapsed.
    const prior: RateCounterState = { windowStart: T0, count: 100 };
    const d = decideRateLimit(prior, at(W - 1), 1, 40, W);
    expect(d.allow).toBe(false);
    expect(d.retryAfterMs).toBe(1);
    expect(d.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(d.retryAfterMs).toBeLessThanOrEqual(W);
  });
});

describe("pages defensive guards (non-finite / <=0 → treated as 0)", () => {
  it("pages = 0 is a no-op (count unchanged, allow)", () => {
    const d = decideRateLimit({ windowStart: T0, count: 10 }, at(0), 0, 40, W);
    expect(d).toEqual({ allow: true, newCount: 10, newWindowStart: T0 });
  });
  it("pages = NaN is a no-op (defensive — endpoint validates upstream)", () => {
    const d = decideRateLimit(
      { windowStart: T0, count: 10 },
      at(0),
      Number.NaN,
      40,
      W,
    );
    expect(d).toEqual({ allow: true, newCount: 10, newWindowStart: T0 });
  });
  it("pages = -3 is a no-op (never a free unlimited pass)", () => {
    const d = decideRateLimit({ windowStart: T0, count: 10 }, at(0), -3, 40, W);
    expect(d).toEqual({ allow: true, newCount: 10, newWindowStart: T0 });
  });
});

describe("exported defaults are sensible (AC2)", () => {
  it("session < ip cap; both positive; window = 24h", () => {
    expect(PER_SESSION_DAILY_PAGES).toBeGreaterThan(0);
    expect(PER_IP_DAILY_PAGES).toBeGreaterThan(PER_SESSION_DAILY_PAGES);
    expect(RATE_WINDOW_MS).toBe(86_400_000);
  });
});
