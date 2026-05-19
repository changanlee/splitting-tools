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
  Loader2Icon,
  PlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyMaskAndEncode } from "@/lib/image/mask";
import { compressToCanvas, ImageDecodeError } from "@/lib/image/compress";
import { MaskEditor } from "@/features/parsing/components/MaskEditor";
import { PageList } from "@/features/parsing/components/PageList";
import { ParseProgress } from "@/features/parsing/components/ParseProgress";
import {
  CreateSessionResponseSchema,
  ParseSubmitResponseSchema,
} from "@/features/parsing/schema";
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
  | { k: "uploading" }
  | { k: "parsing"; linkId: string; jobId: string }
  | { k: "uploadError"; blobs: Blob[] } // keep masked pages on a net blip
  | { k: "error"; message: string };

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
    // The OS picker is async: a file can arrive AFTER the user already
    // tapped 完成 (phase → ready) or while mid-flow. Only honour a pick
    // from a state that legitimately initiated one, else the finished
    // Blob[] (Story 1.3 contract) would be silently discarded.
    if (
      phase.k !== "idle" &&
      phase.k !== "review" &&
      phase.k !== "error"
    ) {
      return;
    }

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
      // Dedupe signature over the FULL masked bytes (NOT a 1 KB prefix):
      // same-device JPEGs share header/quantization-table prefixes, so a
      // short sample collides across DISTINCT receipt pages and would
      // silently drop a real page at finish(). Hashing all bytes makes a
      // false-positive drop effectively impossible while still catching an
      // exact accidental re-capture. Receipt blobs are ~hundreds of KB.
      const fullBuf = await blob.arrayBuffer();
      const signature = computeSignature(
        blob.size,
        new Uint8Array(fullBuf),
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

  const handleRemove = (id: string) => {
    const target = pages.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.thumbUrl);
    const next = removePage(pages, id);
    setPages(next);
    // Removing the last page would otherwise strand the user on an empty
    // review screen with 完成 disabled — send them back to start.
    if (next.length === 0) setPhase({ k: "idle" });
  };

  const handleMove = (id: string, dir: "up" | "down") =>
    setPages((prev) => movePage(prev, id, dir));

  const finish = () => {
    if (phase.k !== "review") return; // re-entrancy / stray-state guard
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
    // Functional updater: revoke whatever the CURRENT list is, never a
    // lagging ref (kills the stale-ref double/missed-revoke class).
    setPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
      return [];
    });
    setPhase({ k: "idle" });
  };

  // Story 1.3: upload the ordered MASKED Blob[] (only artifact allowed
  // to leave the device — NFR-S3; the unmasked originals never existed
  // here) → create session → enqueue parse → poll. On a network blip we
  // keep the masked pages so the payer needn't re-capture.
  const uploadAndParse = async (blobs: Blob[]) => {
    setPhase({ k: "uploading" });
    try {
      const sRes = await fetch("/api/splits", { method: "POST" });
      if (!sRes.ok) throw new Error("session");
      const { linkId } = CreateSessionResponseSchema.parse(
        await sRes.json(),
      );

      const fd = new FormData();
      fd.set("pageCount", String(blobs.length));
      blobs.forEach((b, i) => fd.append("pages", b, `page-${i}.jpg`));

      const pRes = await fetch(
        `/api/splits/${encodeURIComponent(linkId)}/parse-jobs`,
        { method: "POST", body: fd },
      );
      if (!pRes.ok) throw new Error("submit");
      const { jobId } = ParseSubmitResponseSchema.parse(await pRes.json());

      setPhase({ k: "parsing", linkId, jobId });
    } catch {
      setPhase({ k: "uploadError", blobs });
    }
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
            onClick={() => uploadAndParse(phase.blobs)}
          >
            上傳並解析
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

      {phase.k === "uploading" && (
        <p
          className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2Icon className="size-5 shrink-0 animate-spin" aria-hidden />
          上傳中…
        </p>
      )}

      {phase.k === "parsing" && (
        <ParseProgress
          linkId={phase.linkId}
          jobId={phase.jobId}
          onRetry={resetAll}
        />
      )}

      {phase.k === "uploadError" && (
        <div className="flex flex-col gap-4">
          <p
            className="flex items-center gap-2 text-sm font-medium text-destructive"
            role="alert"
          >
            <AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
            上傳失敗，請檢查網路後重試（已遮影像仍保留，不必重拍）。
          </p>
          <Button
            type="button"
            className="h-12 w-full"
            onClick={() => uploadAndParse(phase.blobs)}
          >
            重新上傳（{phase.blobs.length} 頁）
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
