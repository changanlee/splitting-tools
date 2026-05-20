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

interface Props {
  line: ReceiptLineView;
}

export function ReceiptLineRow({ line }: Props) {
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
      className="px-4 py-2 flex items-center gap-3 border-t first:border-t-0 border-border"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{line.description}</span>
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
    </li>
  );
}
