import { describe, expect, it } from "vitest";

import { computeCostUsd } from "@/lib/llm/cost";

describe("computeCostUsd (Story 1.4 NFR-L3, pure)", () => {
  it("prices Sonnet 4.6 input + output", () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    expect(
      computeCostUsd("anthropic/claude-sonnet-4.6", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(18);
  });

  it("prices Haiku 4.5 cheaper", () => {
    expect(
      computeCostUsd("anthropic/claude-haiku-4.5", {
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(1);
  });

  it("applies cache write 1.25x and cache read 0.1x of input price", () => {
    // Sonnet input $3/M: write 1M = 3*1.25 = 3.75 ; read 1M = 3*0.1 = 0.3
    expect(
      computeCostUsd("anthropic/claude-sonnet-4.6", {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 1_000_000,
        cacheReadInputTokens: 1_000_000,
      }),
    ).toBe(4.05);
  });

  it("rounds to 6 decimals (numeric(10,6))", () => {
    const c = computeCostUsd("anthropic/claude-sonnet-4.6", {
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(c).toBe(Math.round(c * 1e6) / 1e6);
  });

  it("unknown model → 0 (non-fatal, still logged)", () => {
    expect(
      computeCostUsd("gpt-whatever", { inputTokens: 999, outputTokens: 999 }),
    ).toBe(0);
  });

  it("negative / NaN token counts never yield a negative cost", () => {
    expect(
      computeCostUsd("anthropic/claude-sonnet-4.6", {
        inputTokens: -100,
        outputTokens: Number.NaN,
      }),
    ).toBe(0);
    expect(
      computeCostUsd("anthropic/claude-sonnet-4.6", {
        inputTokens: 1_000_000,
        outputTokens: -5,
        cacheReadInputTokens: -1,
      }),
    ).toBe(3); // only the valid 1M input @ $3 counts
  });
});
