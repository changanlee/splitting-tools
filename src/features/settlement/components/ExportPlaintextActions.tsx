"use client";

/**
 * Story 5.3 — copy / share the plain-text settlement (passed in
 * pre-rendered as a string prop). Reuses the same UX as the share
 * page (3.3) but with the settlement body.
 */
import { useState } from "react";

interface Props {
  shareText: string;
}

export function ExportPlaintextActions({ shareText }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCopy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("無法複製到剪貼簿，請手動選取下方文字。");
    }
  }

  async function onSystemShare() {
    setError(null);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "分帳結算", text: shareText });
      } catch {
        /* cancelled */
      }
    } else {
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
          📤 分享結算…
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent"
        >
          {copied ? "✓ 已複製" : "複製文字"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="status">
          {error}
        </p>
      ) : null}
      <pre className="rounded border border-border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap break-words">
        {shareText}
      </pre>
    </div>
  );
}
