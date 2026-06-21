/**
 * Story 2.3 — inline edit form for a single receipt line.
 *
 * Server Component — submits to the bound server action. Includes a
 * separate POST-form for delete, so a user can edit OR delete from
 * the same expanded row. "取消" is a plain GET link back to /review
 * (drops the `?edit=` query).
 */
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import {
  deleteLineAction,
  editLineAction,
} from "@/features/reconciliation/server/actions";
import {
  currencyDecimals,
  formatAmountPlain,
} from "@/features/reconciliation/lib/formatCents";
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";

interface Props {
  linkId: string;
  line: ReceiptLineView;
  /** Session ISO 4217 — drives the amount field's decimals (KRW=0). */
  currency: string | null;
}

export function ReceiptLineEditForm({ linkId, line, currency }: Props) {
  const editBound = editLineAction.bind(null, linkId, line.id);
  const deleteBound = deleteLineAction.bind(null, linkId, line.id);
  const decimals = currencyDecimals(currency);
  const amountPattern =
    decimals === 0 ? "^\\d+$" : `^\\d+(\\.\\d{1,${decimals}})?$`;

  return (
    <li
      role="listitem"
      data-line-type="product-editing"
      id={`line-${line.lineNo}`}
      className="px-4 py-3 border-t first:border-t-0 border-border bg-amber-50/40 dark:bg-amber-950/20 scroll-mt-20"
    >
      <form
        action={editBound}
        className="flex flex-col gap-2 text-sm"
        aria-label={`編輯第 ${line.lineNo} 行`}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">品名</span>
          <input
            name="description"
            defaultValue={line.description}
            maxLength={100}
            required
            className="rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">數量（收據）</span>
            <QuantityStepper
              name="qty"
              min={1}
              max={99}
              defaultValue={line.qty}
              size="sm"
              required
              ariaLabel="數量（收據）"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">金額</span>
            <input
              name="amount"
              inputMode={decimals === 0 ? "numeric" : "decimal"}
              pattern={amountPattern}
              defaultValue={formatAmountPlain(line.grossCents, currency)}
              required
              className="rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            份數（拆帳用 — 這行要分成幾份給人認領）
          </span>
          <QuantityStepper
            name="shareCount"
            min={1}
            max={99}
            defaultValue={line.shareCount}
            size="sm"
            required
            ariaLabel="份數（拆帳用）"
          />
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            儲存
          </button>
          <a
            href={`/splits/${linkId}/review`}
            className="rounded border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            取消
          </a>
        </div>
      </form>
      {/* Separate POST form for delete — so a delete confirmation
          isn't conflated with edit submit. */}
      <form
        action={deleteBound}
        className="pt-2 mt-2 border-t border-border/50"
      >
        <button
          type="submit"
          className="text-xs text-destructive underline underline-offset-2 hover:no-underline"
          aria-label={`刪除第 ${line.lineNo} 行`}
        >
          刪除這一行
        </button>
      </form>
    </li>
  );
}
