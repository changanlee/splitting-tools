/**
 * Client-side image compression — Story 1.2 (AC2, AC4).
 *
 * 🔒 CLIENT-ONLY. This file never runs on the server and never performs a
 * network request. The flow is: File -> ImageBitmap -> resized <canvas>.
 * The mask is burned onto the SAME canvas (see mask.ts) BEFORE the only
 * `toBlob` call, so the unmasked image is never encoded into an exportable
 * Blob (NFR-S3). All resize maths is delegated to ./geometry (node-tested).
 *
 * EXIF: `createImageBitmap` + canvas re-encode keeps pixels only — all
 * metadata (incl. GPS) is dropped. `imageOrientation: "from-image"` bakes
 * the EXIF orientation into the pixels first so the result stays upright.
 */
import { computeResizedDimensions } from "@/lib/image/geometry";

/** Thrown when the browser cannot decode the chosen file (e.g. odd HEIC). */
export class ImageDecodeError extends Error {
  constructor(cause?: unknown) {
    super("IMAGE_DECODE_FAILED");
    this.name = "ImageDecodeError";
    this.cause = cause;
  }
}

/** Thrown when the canvas cannot be encoded to a JPEG blob. */
export class ImageEncodeError extends Error {
  constructor(cause?: unknown) {
    super("IMAGE_ENCODE_FAILED");
    this.name = "ImageEncodeError";
    this.cause = cause;
  }
}

export interface CompressedCanvas {
  /** Resized, orientation-corrected, UNMASKED pixels. Display-only until
   *  the mask is burned in (mask.ts). Never encoded/exported as-is. */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/**
 * Decode `file` and draw it resized (long edge <= maxLongEdge, no upscale)
 * onto a fresh canvas. The source ImageBitmap is closed immediately after
 * draw — no lingering reference to the original pixels (AC4).
 */
export async function compressToCanvas(
  file: File,
  maxLongEdge = 1600,
): Promise<CompressedCanvas> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new ImageDecodeError(cause);
  }

  try {
    // Some browsers (notably older iOS Safari with HEIC) resolve
    // createImageBitmap with a 0x0 bitmap instead of rejecting. Treat that
    // as a decode failure so the user gets the accurate "can't open this
    // image" guidance rather than a generic, misleading "try again".
    if (!bitmap.width || !bitmap.height) {
      throw new ImageDecodeError("decoded image has zero dimensions");
    }

    const { width, height } = computeResizedDimensions(
      bitmap.width,
      bitmap.height,
      maxLongEdge,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    // A missing 2D context is an environment/setup failure (e.g. canvas
    // too large for device memory), not an encode failure. Surface it as a
    // decode error so the friendly message advises a different/smaller
    // photo instead of a futile "retry" of the same file.
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageDecodeError("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return { canvas, width, height };
  } finally {
    // Release the original decoded pixels regardless of success (AC4 /
    // NFR-S3 — no unmasked original kept around).
    bitmap.close();
  }
}

/**
 * Encode a canvas to a JPEG Blob. This is the ONLY place a Blob is
 * produced; callers must pass the canvas that already has the mask burned
 * in (NFR-S3). Re-encoding drops all EXIF/metadata.
 */
export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = 0.8,
  timeoutMs = 15_000,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // `toBlob` is known to never invoke its callback on some mobile
    // WebViews with large canvases. Without this timeout the whole capture
    // flow would hang forever with no error path; the race guarantees the
    // promise always settles so the UI can show a friendly retry (AC6).
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new ImageEncodeError("toBlob timed out"));
    }, timeoutMs);

    canvas.toBlob(
      (blob) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (blob) resolve(blob);
        else reject(new ImageEncodeError("toBlob returned null"));
      },
      "image/jpeg",
      quality,
    );
  });
}
