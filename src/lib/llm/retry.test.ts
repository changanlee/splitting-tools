import { describe, expect, it } from "vitest";

import {
  backoffWithJitterMs,
  buildAttemptPlan,
  isRetryableStatus,
} from "@/lib/llm/retry";
import { DEGRADATION_MODELS } from "@/lib/llm/models";

describe("isRetryableStatus (NFR-L1: transient only)", () => {
  it("retries 429 / 5xx / 529", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(529)).toBe(true);
  });
  it("does NOT retry 4xx client errors or undefined", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(413)).toBe(false);
    expect(isRetryableStatus(undefined)).toBe(false);
  });
});

describe("backoffWithJitterMs (full jitter, deterministic via rng)", () => {
  it("rng=0 → 0; rng=1 → the exponential ceiling for that attempt", () => {
    expect(backoffWithJitterMs(0, { baseMs: 500, rng: () => 0 })).toBe(0);
    expect(backoffWithJitterMs(0, { baseMs: 500, rng: () => 0.999999 })).toBe(
      499,
    );
    expect(backoffWithJitterMs(3, { baseMs: 500, rng: () => 0.999999 })).toBe(
      3999,
    ); // 500*2^3 = 4000
  });
  it("caps the exponential growth", () => {
    expect(
      backoffWithJitterMs(20, { baseMs: 500, capMs: 15_000, rng: () => 1 }),
    ).toBe(15_000);
  });
});

describe("buildAttemptPlan (NFR-R1 degradation order)", () => {
  it("sonnet ×3 then haiku ×3, in order", () => {
    const plan = buildAttemptPlan(DEGRADATION_MODELS, 3);
    expect(plan).toHaveLength(6);
    expect(plan.map((s) => `${s.model}#${s.attempt}`)).toEqual([
      "claude-sonnet-4-6#1",
      "claude-sonnet-4-6#2",
      "claude-sonnet-4-6#3",
      "claude-haiku-4-5-20251001#1",
      "claude-haiku-4-5-20251001#2",
      "claude-haiku-4-5-20251001#3",
    ]);
  });
  it("respects a custom retriesPerModel", () => {
    expect(buildAttemptPlan(["m"], 1)).toEqual([{ model: "m", attempt: 1 }]);
  });
});
