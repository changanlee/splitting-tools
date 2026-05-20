/**
 * Story 2.2 — top-of-page locator for suspicious lines (FR9).
 *
 * Pure HTML anchor links — no client island, no JS. CSS
 * `scroll-margin-top` on the target row (`scroll-mt-20` in
 * ReceiptLineRow) keeps the destination from sliding under the
 * sticky SubtotalBar. Browser's native anchor behaviour does the
 * scrolling.
 */

interface Props {
  suspiciousLineNos: number[];
}

export function SuspiciousSummary({ suspiciousLineNos }: Props) {
  if (suspiciousLineNos.length === 0) return null;
  return (
    <nav
      aria-label="可疑行清單"
      className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="font-medium">
        ⚠ 可疑 {suspiciousLineNos.length} 行：
      </span>{" "}
      <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
        {suspiciousLineNos.map((lineNo) => (
          <a
            key={lineNo}
            href={`#line-${lineNo}`}
            className="underline underline-offset-2 hover:no-underline"
          >
            第 {lineNo} 行
          </a>
        ))}
      </span>
    </nav>
  );
}
