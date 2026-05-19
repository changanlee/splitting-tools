/**
 * Pure image geometry — NO DOM, fully unit-testable in node (AC5).
 *
 * The canvas/ImageBitmap glue (compress.ts / mask.ts) delegates all maths
 * here so the testable logic never depends on a browser environment.
 * Story 1.2 — capture/compress/mask, client-side only.
 */

export interface Dimensions {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function assertPositiveFinite(...values: number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`Expected a positive finite number, got: ${v}`);
    }
  }
}

/**
 * Fit an image so its LONG edge is at most `maxLongEdge`, preserving aspect
 * ratio. Never upscales (AC2: "不放大小於 1600px 的圖"). Returns integer px.
 */
export function computeResizedDimensions(
  srcWidth: number,
  srcHeight: number,
  maxLongEdge = 1600,
): Dimensions {
  assertPositiveFinite(srcWidth, srcHeight, maxLongEdge);

  const longEdge = Math.max(srcWidth, srcHeight);
  if (longEdge <= maxLongEdge) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

/**
 * Normalize a (possibly inverted / out-of-bounds / fractional) mask rect to
 * integer pixels fully inside [0,imgWidth] x [0,imgHeight]. A rect entirely
 * outside the image collapses to zero area. Used before burning the mask
 * into the canvas (AC3/AC4) so a stray drag can never paint outside or be
 * interpreted as no-op silently.
 */
export function clampMaskRect(
  rect: Rect,
  imgWidth: number,
  imgHeight: number,
): Rect {
  assertPositiveFinite(imgWidth, imgHeight);

  // Normalize inverted drags (negative width/height) to a top-left origin.
  let { x, y, width, height } = rect;
  if (width < 0) {
    x += width;
    width = -width;
  }
  if (height < 0) {
    y += height;
    height = -height;
  }

  const left = Math.round(Math.min(Math.max(x, 0), imgWidth));
  const top = Math.round(Math.min(Math.max(y, 0), imgHeight));
  const right = Math.round(Math.min(Math.max(x + width, 0), imgWidth));
  const bottom = Math.round(Math.min(Math.max(y + height, 0), imgHeight));

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * AC3 gate: the payer may proceed ONLY if they have applied at least one
 * real (positive-area) mask rect, OR explicitly confirmed the receipt has
 * no member card number. Never auto-pass an un-decided image (NFR-S3).
 */
export function hasUsableMaskOrSkip(
  rects: Rect[],
  skipConfirmed: boolean,
): boolean {
  if (skipConfirmed === true) return true;
  return rects.some((r) => r.width > 0 && r.height > 0);
}
