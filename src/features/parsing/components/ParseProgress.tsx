"use client";

/**
 * ParseProgress — Story 1.3 (AC3/AC9). Shows the parse job's real
 * status (not a black-box spinner): the five states are triple-encoded
 * (text + icon + semantic colour). Mobile single-column; friendly
 * failure + retry (raw errors never reach here — server sends only
 * friendly `message`, NFR-R1).
 */
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  WifiOffIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useParseJobPolling } from "@/features/parsing/hooks/useParseJobPolling";

interface ParseProgressProps {
  linkId: string;
  jobId: string;
  /** Re-capture/re-submit from scratch (caller owns the flow). */
  onRetry: () => void;
}

export function ParseProgress({
  linkId,
  jobId,
  onRetry,
}: ParseProgressProps) {
  const { data, isError, timedOut } = useParseJobPolling(linkId, jobId);

  // Network/fetch failure (status endpoint unreachable) — friendly + retry.
  if (isError) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <WifiOffIcon className="size-5 shrink-0" aria-hidden />
          連線不穩，暫時拿不到解析進度。
        </p>
        <Button type="button" className="h-12 w-full" onClick={onRetry}>
          重試
        </Button>
      </div>
    );
  }

  // Hard poll-ceiling reached without a terminal status — never leave
  // the payer spinning forever (NFR-R2). Friendly terminal + retry.
  if (timedOut) {
    return (
      <div className="flex flex-col gap-4" role="alert">
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
          解析時間過長，請重試一次。
        </p>
        <Button type="button" className="h-12 w-full" onClick={onRetry}>
          重拍重試
        </Button>
      </div>
    );
  }

  const status = data?.status ?? "queued";
  const message = data?.message;

  if (status === "queued" || status === "processing") {
    return (
      <p
        className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2Icon className="size-5 shrink-0 animate-spin" aria-hidden />
        {status === "queued" ? "排隊中…" : "解析中…"}
      </p>
    );
  }

  if (status === "succeeded" || status === "degraded") {
    const ok = status === "succeeded";
    return (
      <div className="flex flex-col gap-3" role="status" aria-live="polite">
        <p
          className={`flex items-center gap-2 text-sm font-medium ${
            ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          <CheckCircle2Icon className="size-5 shrink-0" aria-hidden />
          {ok ? "解析完成。" : (message ?? "已完成（備援模式）。")}
        </p>
        {/* Downstream (reconciliation Epic 2) is a later story. */}
        <Button
          type="button"
          className="h-12 w-full"
          disabled
          title="核對閘門於 Epic 2 實作"
        >
          下一步：核對（即將推出）
        </Button>
      </div>
    );
  }

  // failed
  return (
    <div className="flex flex-col gap-4" role="alert">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangleIcon className="size-5 shrink-0" aria-hidden />
        {message ?? "解析失敗，請再試一次。"}
      </p>
      <Button type="button" className="h-12 w-full" onClick={onRetry}>
        重拍重試
      </Button>
    </div>
  );
}
