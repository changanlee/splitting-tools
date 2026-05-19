"use client";

/**
 * CaptureFlow — Story 1.2 + 1.2b (multi-page). CLIENT-ONLY.
 *
 * 🔒 NFR-S3 (PER PAGE): every page's unmasked compressed canvas is held
 * in state ONLY while that page is masked, then dropped. The single
 * artifact retained for the next step (Story 1.3 upload) is the ORDERED,
 * deduped array of per-page masked + compressed JPEG Blobs. Original
 * Files are never stored, never persisted (no localStorage/IndexedDB),
 * never logged. Thumbnails use `URL.createObjectURL` of the
 * ALREADY-MASKED blob only (AC2 exception) and are revoked on
 * remove / dedupe-drop / reset / unmount — never on an unmasked image.
 *
 * Scope rails (AC9): no network request (upload = Story 1.3), no
 * visionAdapter, no API route, no pg-boss, zero new npm deps.
 */
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CameraIcon,
  CheckCircle2Icon,
  PlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyMaskAndEncode } from "@/lib/image/mask";
import { compressToCanvas, ImageDecodeError } from "@/lib/image/compress";
import { MaskEditor } from "@/features/parsing/components/MaskEditor";
import { PageList } from "@/features/parsing/components/PageList";
import {
  addPage,
  allPagesDecided,
  computeSignature,
  dedupePages,
  movePage,
  nextPageId,
  type Page,
  removePage,
} from "@/lib/image/pages";
import type { Rect } from "@/lib/image/geometry";

/** A captured page: pure {@link Page} metadata + the masked artifact. */
export interface PageItem extends Page {
  /** Masked + compressed JPEG — the ONLY exportable artifact (NFR-S3). */
  blob: Blob;
  /** Object URL of the MASKED blob only (AC2 exception). */
  thumbUrl: string;
}

type Phase =
  | { k: "idle" }
  | { k: "compressing" }
  | { k: "editing"; canvas: HTMLCanvasElement }
  | { k: "review" }
  | { k: "ready"; blobs: Blob[] }
  | { k: "error"; message: string };

/** Bytes sampled from the masked blob to build the dedupe signature. */
const SIGNATURE_SAMPLE_BYTES = 1024;

function friendlyError(err: unknown): string {
  if (err instanceof ImageDecodeError) {
    return "這張圖片無法在你的裝置開啟（可能是不支援的格式）。請改用相機拍一張，或換一張照片。";
  }
  return "影像處理失敗，請再試一次。";
}

export function CaptureFlow() {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const [pages, setPages] = useState<PageItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Latest pages for unmount cleanup (effect deps must stay []).
  const pagesRef = useRef<PageItem[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(
    () => () => {
      pagesRef.current.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
    },
    [],
  );

  const pickImage = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange (AC1).
    e.target.value = "";
    if (!file) return;

    setPhase({ k: "compressing" });
    try {
      const { canvas } = await compressToCanvas(file);
      setPhase({ k: "editing", canvas });
    } catch (err) {
      setPhase({ k: "error", message: friendlyError(err) });
    }
  };

  const onConfirmMask = async (rects: Rect[], skipConfirmed: boolean) => {
    if (phase.k !== "editing") return;
    const canvas = phase.canvas;
    // Lock SYNCHRONOUSLY before the async burn so a double-tap can't run
    // the destructive in-place burn twice (carried from Story 1.2).
    setPhase({ k: "compressing" });
    try {
      const blob = await applyMaskAndEncode(canvas, skipConfirmed ? [] : rects);
      // Dedupe signature: size + a small byte sample of the MASKED blob.
      const sampleBuf = await blob
        .slice(0, SIGNATURE_SAMPLE_BYTES)
        .arrayBuffer();
      const signature = computeSignature(
        blob.size,
        new Uint8Array(sampleBuf),
      );
      const item: PageItem = {
        id: nextPageId(),
        signature,
        decided: true, // decided-by-construction: confirmed mask/skip (AC5)
        blob,
        thumbUrl: URL.createObjectURL(blob), // MASKED blob only (AC2)
      };
      setPages((prev) => addPage(prev, item));
      setPhase({ k: "review" });
    } catch {
      setPhase({ k: "error", message: "遮蔽處理失敗，請重拍一次。" });
    }
  };

  const onRetakeCurrent = () =>
    setPhase(pages.length > 0 ? { k: "review" } : { k: "idle" });

  const handleRemove = (id: string) =>
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.thumbUrl);
      return removePage(prev, id);
    });

  const handleMove = (id: string, dir: "up" | "down") =>
    setPages((prev) => movePage(prev, id, dir));

  const finish = () => {
    const deduped = dedupePages(pages);
    // Revoke thumbnails of pages dropped by dedupe (no leaked URLs).
    const kept = new Set(deduped.map((p) => p.id));
    pages.forEach((p) => {
      if (!kept.has(p.id)) URL.revokeObjectURL(p.thumbUrl);
    });
    setPages(deduped);
    // Output contract for Story 1.3: an ORDERED, deduped Blob[]
    // (single page → length 1, semantically compatible with 1.2).
    setPhase({ k: "ready", blobs: deduped.map((p) => p.blob) });
  };

  const resetAll = () => {
    pagesRef.current.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
    setPages([]);
    setPhase({ k: "idle" });
  };

  const totalKb =
    phase.k === "ready"
      ? Math.round(
          phase.blobs.reduce((sum, b) => sum + b.size, 0) / 1024,
        )
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 p-4">
      {/*
        `sr-only`, NOT `hidden`/`display:none`: iOS Safari/WebKit ignores
        a programmatic `.click()` on a display:none file input. And do NOT
        add `capture="environment"` — on iOS it forces the camera and
        removes the Photo Library / Choose File option (violates AC1).
      */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onFileChange}
      />

      {phase.k === "idle" && (
        <>
          <p className="text-sm text-muted-foreground">
            拍收據；長收據一張拍不完可以分段多拍幾張。會員卡號會在你的裝置上遮掉，不會外傳。
          </p>
          <Button
            type="button"
            className="h-14 w-full text-base"
            onClick={pickImage}
          >
            <CameraIcon className="size-5" aria-hidden />
            拍收據
          </Button>
        </>
      )}

      {phase.k === "compressing" && (
        <p
          className="py-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          影像處理中…
        </p>
      )}

      {phase.k === "editing" && (
        <MaskEditor
          sourceCanvas={phase.canvas}
          onConfirm={onConfirmMask}
          onRetake={onRetakeCurrent}
        />
      )}

      {phase.k === "review" && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2Icon
              className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            已加入 {pages.length} 頁。長收據可「再拍下一段」，順序就是收據由上到下。
          </p>

          <PageList
            pages={pages}
            onMove={handleMove}
            onRemove={handleRemove}
          />

          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            onClick={pickImage}
          >
            <PlusIcon className="size-5" aria-hidden />
            再拍下一段
          </Button>
          <Button
            type="button"
            className="h-12 w-full"
            disabled={!allPagesDecided(pages)}
            onClick={finish}
          >
            完成（{pages.length} 頁）
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-12 w-full"
            onClick={resetAll}
          >
            全部重拍
          </Button>
        </div>
      )}

      {phase.k === "ready" && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-5 shrink-0" aria-hidden />
            卡號已遮蔽，只有這 {phase.blobs.length} 頁影像會上傳。
          </p>
          <p className="text-sm text-muted-foreground">
            共 {phase.blobs.length} 頁，已壓縮影像大小：約 {totalKb} KB
          </p>
          <Button
            type="button"
            className="h-12 w-full"
            disabled
            title="上傳於 Story 1.3 實作"
          >
            下一步：上傳（即將推出）
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full"
            onClick={resetAll}
          >
            全部重拍
          </Button>
        </div>
      )}

      {phase.k === "error" && (
        <div className="flex flex-col gap-4">
          <p
            className="flex items-center gap-2 text-sm font-medium text-destructive"
            role="alert"
          >
            <AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
            {phase.message}
          </p>
          <Button type="button" className="h-12 w-full" onClick={pickImage}>
            重試
          </Button>
          {pages.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full"
              onClick={() => setPhase({ k: "review" })}
            >
              回到已拍的 {pages.length} 頁
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
