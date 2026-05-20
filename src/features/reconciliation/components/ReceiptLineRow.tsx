/**
 * Story 2.1 — ReceiptLineRow, `review-readonly` variant only.
 *
 * Server Component. 2-1 displays receipt lines read from receipt_lines
 * (1.5 schema) without any edit/claim/IRC-rebind affordances — every
 * interactive variant is owned by later stories (claim → Epic 4,
 * editing → 2-3, IRC rebind → 2-4, suspicious highlight → 2-2).
 *
 * Visual semantics per UX spec L506-515:
 *   - normal parent / standalone line   → standard row
 *   - IRC discount (claimable=false)    → indented small "折抵 -NT$X.XX"
 *   - orphan IRC                        → grey-out + Epic-2-rebind hint
 *
 * Money is integer cents — `gross_cents` and `net_cents` come straight
 * from 1.5; this component does NOT re-derive IRC attribution.
 */
import { cn } from "@/lib/utils";

import { formatCents } from "@/features/reconciliation/lib/formatCents";
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";
import type { SuspiciousResult } from "@/features/reconciliation/suspicious";

interface Props {
  line: ReceiptLineView;
  /**
   * Story 2.2: optional suspicious-line classification result.
   * When `severity==='suspicious'`, the row gets an amber border-left
   * marker + ⚠ icon + 「可疑」 text (a11y triple encoding); when
   * absent or `'normal'`, the row renders unchanged from 2.1.
   */
  suspicious?: SuspiciousResult;
  /**
   * Story 2.3: when present, renders an 「編輯」 anchor on the row
   * pointing at the supplied href (typically `?edit=<lineId>`). IRC
   * rows never get this (re-binding is Story 2.4).
   */
  editHref?: string;
}

export function ReceiptLineRow({ line, suspicious, editHref }: Props) {
  const isSuspicious = suspicious?.severity === "suspicious";
  if (line.isIrc) {
    // IRC discount line: folded into its parent's net by 1.5; render
    // as a small attribution row under the parent's slot in the list.
    // Display the original (negative) gross so users see "what was
    // attributed", not the parent's post-net total.
    return (
      <li
        role="listitem"
        data-line-type={line.orphan ? "irc-orphan" : "irc-child"}
        className={cn(
          "pl-8 pr-4 py-1 text-sm flex items-center gap-2",
          line.orphan
            ? "text-muted-foreground italic"
            : "text-muted-foreground",
        )}
      >
        <span className="flex-1">
          {line.orphan ? (
            <>
              孤兒 IRC（尚未對應母品項 — 由 Story 2.4 處理改綁）
            </>
          ) : (
            <>折抵</>
          )}
          {line.description && line.description !== "IRC" ? (
            <span className="ml-2 text-xs opacity-70">{line.description}</span>
          ) : null}
        </span>
        <span className="tabular-nums">
          {formatCents(line.grossCents, { signed: true })}
        </span>
      </li>
    );
  }

  // Normal product line — show net (gross + Σ IRC, already computed in
  // 1.5). If net differs from gross we know IRC was attributed to it;
  // show both with the gross faded.
  const wasDiscounted = line.netCents !== line.grossCents;

  return (
    <li
      role="listitem"
      data-line-type="product"
      data-suspicious={isSuspicious ? "true" : undefined}
      id={`line-${line.lineNo}`}
      className={cn(
        "px-4 py-2 flex items-center gap-3 border-t first:border-t-0 border-border",
        // Anchor offset for #line-N jumps: avoid being covered by the
        // sticky subtotal bar at the top (review P3 / Story 2.2 AC3).
        "scroll-mt-20",
        isSuspicious &&
          "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
      )}
    >
      {isSuspicious ? (
        <span
          aria-label="可疑行"
          title={suspicious?.flags.join(", ")}
          className="shrink-0 text-amber-700 dark:text-amber-300 text-lg leading-none"
        >
          ⚠
        </span>
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{line.description}</span>
        {isSuspicious ? (
          <span className="block text-xs text-amber-700 dark:text-amber-300 font-medium">
            可疑（{suspicious!.flags.join("、")}）
          </span>
        ) : null}
        {line.rawText ? (
          <span className="block text-xs text-muted-foreground truncate">
            {line.rawText}
          </span>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        ×{line.qty}
      </span>
      <span className="tabular-nums text-right shrink-0 min-w-[7ch]">
        {wasDiscounted ? (
          <>
            <span className="block text-sm font-semibold">
              {formatCents(line.netCents)}
            </span>
            <span className="block text-xs text-muted-foreground line-through">
              {formatCents(line.grossCents)}
            </span>
          </>
        ) : (
          <span className="text-sm font-semibold">
            {formatCents(line.netCents)}
          </span>
        )}
      </span>
      {editHref ? (
        <a
          href={editHref}
          className="shrink-0 text-xs text-primary underline underline-offset-2 hover:no-underline"
          aria-label={`編輯第 ${line.lineNo} 行`}
        >
          編輯
        </a>
      ) : null}
    </li>
  );
}
