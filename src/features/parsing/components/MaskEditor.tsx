"use client";

/**
 * MaskEditor — Story 1.2 (AC3, AC7, AC8). CLIENT-ONLY, no network.
 *
 * Decided interaction (user, 2026-05-19): manual draggable opaque solid
 * rectangles, OR an explicit "no card number" confirmation. The payer
 * cannot proceed until `hasUsableMaskOrSkip` is satisfied. The on-screen
 * boxes are an EDITING affordance only — the real, irreversible mask is
 * burned into pixels by mask.ts at confirm time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LockIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { hasUsableMaskOrSkip, type Rect } from "@/lib/image/geometry";

interface MaskEditorProps {
  /** Compressed, UNMASKED, display-only canvas. Never exported as-is. */
  sourceCanvas: HTMLCanvasElement;
  onConfirm: (rects: Rect[], skipConfirmed: boolean) => void;
  onRetake: () => void;
}

export function MaskEditor({
  sourceCanvas,
  onConfirm,
  onRetake,
}: MaskEditorProps) {
  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [skip, setSkip] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const imgW = sourceCanvas.width;
  const imgH = sourceCanvas.height;

  // Paint the compressed (unmasked) pixels into a display canvas. Display
  // only — this canvas is never encoded or sent (NFR-S3).
  useEffect(() => {
    const display = displayRef.current;
    if (!display) return;
    display.width = imgW;
    display.height = imgH;
    display.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
  }, [sourceCanvas, imgW, imgH]);

  const toImageCoords = useCallback(
    (clientX: number, clientY: number) => {
      const box = displayRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
      return {
        x: ((clientX - box.left) / box.width) * imgW,
        y: ((clientY - box.top) / box.height) * imgH,
      };
    },
    [imgW, imgH],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (skip) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImageCoords(e.clientX, e.clientY);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (skip || !startRef.current) return;
    const p = toImageCoords(e.clientX, e.clientY);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  };

  const onPointerUp = () => {
    if (draft && draft.width > 4 && draft.height > 4) {
      setRects((prev) => [...prev, draft]);
    }
    setDraft(null);
    startRef.current = null;
  };

  const removeRect = (idx: number) =>
    setRects((prev) => prev.filter((_, i) => i !== idx));

  const toggleSkip = (checked: boolean) => {
    setSkip(checked);
    if (checked) {
      setRects([]);
      setDraft(null);
    }
  };

  const canProceed = hasUsableMaskOrSkip(rects, skip);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const boxes = draft ? [...rects, draft] : rects;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LockIcon className="size-4 shrink-0" aria-hidden />
        卡號只留在你的裝置上，只有遮好的影像才會上傳。
      </p>

      <div
        ref={wrapRef}
        className="relative w-full touch-none overflow-hidden rounded-lg border"
      >
        <canvas
          ref={displayRef}
          className="block h-auto w-full select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="收據預覽，拖拉以遮蔽會員卡號"
        />
        {boxes.map((r, i) => (
          <div
            key={i}
            className="absolute border-2 border-foreground bg-foreground/70"
            style={{
              left: pct(r.x, imgW),
              top: pct(r.y, imgH),
              width: pct(r.width, imgW),
              height: pct(r.height, imgH),
            }}
          >
            {i < rects.length && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => removeRect(i)}
                aria-label={`移除遮罩 ${i + 1}`}
                className="absolute -top-3 -right-3 flex size-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <XIcon className="size-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      <label className="flex items-center gap-3 text-sm">
        <Checkbox
          checked={skip}
          onCheckedChange={(c) => toggleSkip(c === true)}
        />
        此收據沒有會員卡號
      </label>

      {!canProceed && (
        <p className="text-sm text-muted-foreground" role="status">
          拖一個方框蓋住卡號，或勾選上方「沒有會員卡號」才能繼續。
        </p>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1"
          onClick={onRetake}
        >
          重新拍
        </Button>
        <Button
          type="button"
          className="h-12 flex-1"
          disabled={!canProceed}
          onClick={() => onConfirm(skip ? [] : rects, skip)}
        >
          下一步
        </Button>
      </div>
    </div>
  );
}
