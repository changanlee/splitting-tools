import { describe, expect, it } from "vitest";

import {
  clampMaskRect,
  computeResizedDimensions,
  hasUsableMaskOrSkip,
} from "@/lib/image/geometry";

describe("computeResizedDimensions (AC2: long edge ~1600, equal ratio, no upscale)", () => {
  it("scales a landscape image so the long edge becomes 1600", () => {
    expect(computeResizedDimensions(4000, 3000)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("scales a portrait image so the long edge becomes 1600", () => {
    expect(computeResizedDimensions(3000, 4000)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("scales a square image to 1600x1600", () => {
    expect(computeResizedDimensions(2000, 2000)).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it("does NOT upscale images already within the limit", () => {
    expect(computeResizedDimensions(800, 600)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("leaves an image whose long edge is exactly 1600 unchanged", () => {
    expect(computeResizedDimensions(1600, 900)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("respects a custom maxLongEdge", () => {
    expect(computeResizedDimensions(2000, 1000, 1000)).toEqual({
      width: 1000,
      height: 500,
    });
  });

  it("never collapses a thin image below 1px", () => {
    const d = computeResizedDimensions(5000, 1);
    expect(d.width).toBe(1600);
    expect(d.height).toBe(1);
  });

  it("throws on non-positive or non-finite dimensions", () => {
    expect(() => computeResizedDimensions(0, 100)).toThrow(RangeError);
    expect(() => computeResizedDimensions(-1, 100)).toThrow(RangeError);
    expect(() => computeResizedDimensions(100, Number.NaN)).toThrow(RangeError);
    expect(() => computeResizedDimensions(100, 100, 0)).toThrow(RangeError);
  });
});

describe("clampMaskRect (AC3/AC4: normalize + clamp mask rect to image bounds)", () => {
  it("leaves an in-bounds rect unchanged (as integers)", () => {
    expect(clampMaskRect({ x: 10, y: 20, width: 30, height: 40 }, 200, 200)).toEqual(
      { x: 10, y: 20, width: 30, height: 40 },
    );
  });

  it("rounds OUTWARD so the mask never shrinks below the selection (privacy-safe)", () => {
    // x=10.6 -> floor 10 ; right=41.0 -> ceil 41 ; width 31 (>= the
    // selected 30.4, never less). y=20.2 -> floor 20 ; bottom=61.1 ->
    // ceil 62 ; height 42. Rounding only ever covers MORE of the card.
    expect(
      clampMaskRect({ x: 10.6, y: 20.2, width: 30.4, height: 40.9 }, 200, 200),
    ).toEqual({ x: 10, y: 20, width: 31, height: 42 });
  });

  it("never erodes a sub-pixel-thin mask to zero (defeats the privacy intent)", () => {
    const r = clampMaskRect({ x: 10.6, y: 5, width: 0.4, height: 20 }, 200, 200);
    // Math.round would give left=11,right=11 -> width 0 (card exposed).
    // Outward rounding keeps a >=1px cover.
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(20);
  });

  it("collapses a non-finite (NaN/Infinity) rect to zero area", () => {
    expect(
      clampMaskRect({ x: Number.NaN, y: 0, width: 10, height: 10 }, 200, 200),
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(
      clampMaskRect(
        { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 },
        200,
        200,
      ),
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("normalizes a rect dragged up-left (negative width/height)", () => {
    expect(
      clampMaskRect({ x: 100, y: 100, width: -50, height: -50 }, 200, 200),
    ).toEqual({ x: 50, y: 50, width: 50, height: 50 });
  });

  it("clamps a rect that overflows the right/bottom edges", () => {
    expect(
      clampMaskRect({ x: 150, y: 150, width: 100, height: 100 }, 200, 200),
    ).toEqual({ x: 150, y: 150, width: 50, height: 50 });
  });

  it("clamps a rect with a negative origin", () => {
    expect(
      clampMaskRect({ x: -20, y: -10, width: 60, height: 40 }, 200, 200),
    ).toEqual({ x: 0, y: 0, width: 40, height: 30 });
  });

  it("returns a zero-area rect when fully outside the image", () => {
    const r = clampMaskRect({ x: 5000, y: 5000, width: 10, height: 10 }, 1600, 1200);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  it("throws on non-positive or non-finite image bounds", () => {
    expect(() => clampMaskRect({ x: 0, y: 0, width: 1, height: 1 }, 0, 100)).toThrow(
      RangeError,
    );
    expect(() =>
      clampMaskRect({ x: 0, y: 0, width: 1, height: 1 }, 100, Number.POSITIVE_INFINITY),
    ).toThrow(RangeError);
  });
});

describe("hasUsableMaskOrSkip (AC3: must mask >=1 region OR explicitly confirm no card)", () => {
  it("is false with no rects and no skip confirmation (cannot proceed)", () => {
    expect(hasUsableMaskOrSkip([], false)).toBe(false);
  });

  it("is true when the user explicitly confirms there is no card number", () => {
    expect(hasUsableMaskOrSkip([], true)).toBe(true);
  });

  it("is true with at least one positive-area mask rect", () => {
    expect(
      hasUsableMaskOrSkip([{ x: 0, y: 0, width: 10, height: 10 }], false),
    ).toBe(true);
  });

  it("ignores zero-area rects (a degenerate drag is not a real mask)", () => {
    expect(
      hasUsableMaskOrSkip([{ x: 0, y: 0, width: 0, height: 10 }], false),
    ).toBe(false);
  });
});
