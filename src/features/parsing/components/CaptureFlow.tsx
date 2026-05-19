"use client";

/**
 * CaptureFlow — Story 1.2 (AC1, AC3, AC4, AC6, AC7, AC8). CLIENT-ONLY.
 *
 * 🔒 NFR-S3 / AC4: this component performs NO network request. The
 * unmasked compressed canvas is held in state ONLY while the payer masks
 * it, then dropped. The single artifact retained for the next step (Story
 * 1.3 upload) is the masked + compressed JPEG Blob. The original File is
 * never stored, never persisted (no localStorage/IndexedDB), never logged.
 */
import { useRef, useState } from "react";
import { AlertTriangleIcon, CameraIcon, CheckCircle2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyMaskAndEncode } from "@/lib/image/mask";
import {
  compressToCanvas,
  ImageDecodeError,
} from "@/lib/image/compress";
import { MaskEditor } from "@/features/parsing/components/MaskEditor";
import type { Rect } from "@/lib/image/geometry";

type Phase =
  | { k: "idle" }
  | { k: "compressing" }
  | { k: "editing"; canvas: HTMLCanvasElement }
  | { k: "ready"; blob: Blob }
  | { k: "error"; message: string };

function friendlyError(err: unknown): string {
  if (err instanceof ImageDecodeError) {
    return "這張圖片無法在你的裝置開啟（可能是不支援的格式）。請改用相機拍一張，或換一張照片。";
  }
  return "影像處理失敗，請再試一次。";
}

export function CaptureFlow() {
  const [phase, setPhase] = useState<Phase>({ k: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pickImage = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange (AC1:
    // cancel / re-pick must not get stuck).
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
    // Lock SYNCHRONOUSLY before the async burn/encode. This unmounts the
    // editor and makes a second tap of "下一步" hit the guard above, so
    // `applyMaskAndEncode` (a destructive in-place burn) can never run
    // twice on the same canvas or race a concurrent edit.
    setPhase({ k: "compressing" });
    try {
      // Burns the mask irreversibly, then encodes. `skipConfirmed` => no
      // rects (payer attested there is no card number); the image is still
      // re-encoded so EXIF is stripped and it is compressed.
      const blob = await applyMaskAndEncode(canvas, skipConfirmed ? [] : rects);
      // Drop the unmasked canvas reference (AC4 / NFR-S3).
      setPhase({ k: "ready", blob });
    } catch {
      setPhase({ k: "error", message: "遮蔽處理失敗，請重拍一次。" });
    }
  };

  const reset = () => setPhase({ k: "idle" });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 p-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {phase.k === "idle" && (
        <>
          <p className="text-sm text-muted-foreground">
            拍一張收據，會員卡號會在你的裝置上遮掉，不會外傳。
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
        <p className="py-8 text-center text-sm text-muted-foreground" role="status">
          影像處理中…
        </p>
      )}

      {phase.k === "editing" && (
        <MaskEditor
          sourceCanvas={phase.canvas}
          onConfirm={onConfirmMask}
          onRetake={reset}
        />
      )}

      {phase.k === "ready" && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2Icon className="size-5 shrink-0" aria-hidden />
            卡號已遮蔽，只有這張影像會上傳。
          </p>
          <p className="text-sm text-muted-foreground">
            已壓縮影像大小：約 {Math.round(phase.blob.size / 1024)} KB
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
            onClick={reset}
          >
            重拍
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
        </div>
      )}
    </div>
  );
}
