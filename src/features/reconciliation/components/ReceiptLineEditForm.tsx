/**
 * Story 2.3 — inline edit form for a single receipt line.
 *
 * Server Component — submits to the bound server action. Includes a
 * separate POST-form for delete, so a user can edit OR delete from
 * the same expanded row. "取消" is a plain GET link back to /review
 * (drops the `?edit=` query).
 */
import {
  deleteLineAction,
  editLineAction,
} from "@/features/reconciliation/server/actions";
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";

interface Props {
  linkId: string;
  line: ReceiptLineView;
}

function dollarsString(cents: number): string {
  // Inverse of parseCentsInput for the prefilled value; integer cents
  // → "X.XX" form fields' default. Negative kept as-is for IRC rows;
  // 2-3 only mutates non-IRC lines but the input must round-trip.
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function ReceiptLineEditForm({ linkId, line }: Props) {
  const editBound = editLineAction.bind(null, linkId, line.id);
  const deleteBound = deleteLineAction.bind(null, linkId, line.id);

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
            <span className="text-xs text-muted-foreground">數量</span>
            <input
              name="qty"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              defaultValue={line.qty}
              required
              className="rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">金額 NT$</span>
            <input
              name="amount"
              inputMode="decimal"
              pattern="^\d+(\.\d{1,2})?$"
              defaultValue={dollarsString(line.grossCents)}
              required
              className="rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>
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
