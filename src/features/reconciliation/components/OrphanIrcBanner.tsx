/**
 * Story 2.1 — Orphan IRC warning banner (review P3).
 *
 * When the parsed sum happens to match the printed total but one or
 * more IRC discount lines are orphaned (no parent product code), the
 * StickySubtotalBar mathematically reads green ✓ "對得上" — yet a
 * downstream settlement (Story 5) would split the wrong amount per
 * line because the orphan IRC isn't attributed to any product. The
 * per-row hint (灰斜體 in ReceiptLineRow) is easy to miss when the
 * top bar shows trust-green. This banner closes that gap by raising
 * the orphan signal NEXT TO the trust bar (still server-rendered,
 * no client state).
 *
 * Scope: just surface the count + point at Story 2.4's IRC-rebind UI.
 * The actual rebind UX is 2.4's job.
 */

interface Props {
  orphanCount: number;
}

export function OrphanIrcBanner({ orphanCount }: Props) {
  if (orphanCount <= 0) return null;
  return (
    <div
      role="status"
      className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      data-orphan-count={orphanCount}
    >
      ⚠ 有 {orphanCount} 筆孤兒 IRC 折扣尚未對應到母品項，總額相符不代表每行金額已正確分攤；待 Story 2.4 處理改綁。
    </div>
  );
}
