"use client";

/**
 * Story 3.3 — 系統分享 ／ 複製 (Web Share API + clipboard fallback).
 *
 * Client island intentionally narrow — receives the pre-formatted
 * share text as a string prop so it doesn't depend on Server data
 * shape. Uses navigator.share when available (mobile Safari /
 * Android), falls back to navigator.clipboard.writeText. No state
 * machine; a one-shot React state to show a "已複製" hint after the
 * fallback path.
 */
import { useState } from "react";

interface Props {
  shareText: string;
  shareUrl: string;
}

export function ShareActions({ shareText, shareUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCopy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      // Reset the affordance after a short window so a second copy
      // also shows feedback.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("無法複製到剪貼簿，請手動選取連結。");
    }
  }

  async function onSystemShare() {
    setError(null);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "分帳連結",
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled or share blocked — no error UI needed.
      }
    } else {
      // Browser without Web Share — fall back to copy.
      await onCopy();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSystemShare}
          className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          📤 分享…
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
          aria-label="複製分享內容"
        >
          {copied ? "✓ 已複製" : "複製"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
