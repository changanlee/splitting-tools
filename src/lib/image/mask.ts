/**
 * Client-side mask burn-in — Story 1.2 (AC3, AC4).
 *
 * 🔒 Burns OPAQUE SOLID rectangles directly into the canvas pixels, then
 * encodes. This is destructive and irreversible by design: the member-card
 * pixels are gone from the only Blob that is ever produced (NFR-S3).
 *
 * ❌ NOT a CSS overlay, NOT `filter: blur` — those are reversible and the
 * original pixels would still leave the device. Solid fill only.
 *
 * Rect coordinates are normalized/clamped via ./geometry (node-tested)
 * before painting so a stray drag can never paint outside the image.
 */
import { canvasToJpegBlob } from "@/lib/image/compress";
import { clampMaskRect, type Rect } from "@/lib/image/geometry";

const MASK_FILL = "#000000";

/**
 * Paint each mask rect as an opaque solid block onto `canvas` in place.
 * Mutates the canvas pixels (destructive). Zero-area rects are skipped.
 */
export function burnMasksIntoCanvas(
  canvas: HTMLCanvasElement,
  rects: Rect[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable for masking");

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = MASK_FILL;

  for (const rect of rects) {
    const r = clampMaskRect(rect, canvas.width, canvas.height);
    if (r.width > 0 && r.height > 0) {
      ctx.fillRect(r.x, r.y, r.width, r.height);
    }
  }

  ctx.restore();
}

/**
 * Burn the masks in, then encode the masked canvas to a JPEG Blob. The
 * returned Blob is the ONLY artifact that may leave the device (Story 1.3
 * uploads it). Callers must drop the canvas reference afterwards so no
 * unmasked intermediate survives (NFR-S3 / AC4).
 */
export async function applyMaskAndEncode(
  canvas: HTMLCanvasElement,
  rects: Rect[],
  quality = 0.8,
): Promise<Blob> {
  burnMasksIntoCanvas(canvas, rects);
  return canvasToJpegBlob(canvas, quality);
}
