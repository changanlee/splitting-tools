/**
 * Story 2.1 — StickySubtotalBar (FR8 信任回饋).
 *
 * Server Component for 2-1: the three states are pure display, sticky
 * is CSS-only, no client interactivity is needed yet. Later stories
 * that introduce polling/edit can `"use client"` it without changing
 * the props contract.
 *
 * Three-state colour + icon + text (a11y triple-encoding per UX
 * spec L514) so colour-blind readers still get the signal:
 *   - verified              → 綠 ✓
 *   - mismatch              → 紅 ⚠ with concrete cents delta
 *   - awaiting_printed_total → 琥珀 ⏳ (v1 ships before Story 2.5)
 */
import { cn } from "@/lib/utils";

import type { ReconciliationResult } from "@/features/reconciliation/compute";
import { formatCents } from "@/features/reconciliation/lib/formatCents";

interface Props {
  parsedSumCents: number;
  reconciliation: ReconciliationResult;
  /** ISO 4217 currency code from the parsed receipt. */
  currency: string | null;
}

const STATE_STYLES = {
  verified: {
    container:
      "bg-green-50 text-green-900 border-green-200 dark:bg-green-950/40 dark:text-green-100 dark:border-green-900",
    icon: "✓",
    iconLabel: "對得上",
  },
  mismatch: {
    container:
      "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-100 dark:border-red-900",
    icon: "⚠",
    iconLabel: "差額",
  },
  awaiting_printed_total: {
    container:
      "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900",
    icon: "⏳",
    iconLabel: "待輸入印製總額",
  },
  unverified: {
    container:
      "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900",
    icon: "⚠",
    iconLabel: "未經對帳驗證",
  },
} as const;

export function StickySubtotalBar({
  parsedSumCents,
  reconciliation,
  currency,
}: Props) {
  const s = STATE_STYLES[reconciliation.state];
  const fmt = (c: number, signed = false) =>
    formatCents(c, { currency, signed });
  const parsedText = fmt(parsedSumCents);

  let detail: string;
  if (reconciliation.state === "verified") {
    detail = `解析 ${parsedText} ✓ 對得上印製總額`;
  } else if (reconciliation.state === "mismatch") {
    const delta = reconciliation.mismatchCents ?? 0;
    const absDeltaText = fmt(Math.abs(delta));
    const framing = delta > 0 ? "解析比印製多" : "解析比印製少";
    detail = `解析 ${parsedText}  ${framing} ${absDeltaText}`;
  } else if (reconciliation.state === "unverified") {
    const delta = reconciliation.mismatchCents;
    if (delta !== null && delta !== 0) {
      const absDeltaText = fmt(Math.abs(delta));
      const framing = delta > 0 ? "解析比印製多" : "解析比印製少";
      detail = `⚠ 未經對帳驗證 · 解析 ${parsedText}（${framing} ${absDeltaText}）`;
    } else {
      detail = `⚠ 未經對帳驗證 · 解析 ${parsedText}`;
    }
  } else {
    detail = `解析 ${parsedText} · 請輸入印製總額`;
  }

  return (
    <div
      // Review P2: visible text inside the live region is already the
      // full status; an aria-label on top would make readers announce
      // the label AND the text. Use role/aria-live alone so the
      // detail string is the single announcement source.
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-10 w-full border-b px-4 py-3",
        "flex items-center gap-3 text-base font-medium",
        "tabular-nums", // keep digits monospaced to avoid jiggle on update
        s.container,
      )}
      data-state={reconciliation.state}
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {s.icon}
      </span>
      <span className="flex-1">{detail}</span>
    </div>
  );
}
