/**
 * Story 2.3 — add a new product line (FR11). Collapsed by default via
 * native <details>; expands to a server-action form. No client JS.
 */
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { addLineAction } from "@/features/reconciliation/server/actions";
import { CURRENCY_PREFIX } from "@/features/reconciliation/lib/formatCents";

interface Props {
  linkId: string;
  currency: string | null;
}

export function AddLineForm({ linkId, currency }: Props) {
  const bound = addLineAction.bind(null, linkId);
  const prefix =
    currency && currency.length > 0
      ? (CURRENCY_PREFIX[currency.toUpperCase()] ?? "")
      : "";
  return (
    <details className="border-t border-border">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-accent/50">
        ＋ 新增一行
      </summary>
      <form action={bound} className="px-4 py-3 flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">品名</span>
          <input
            name="description"
            maxLength={100}
            required
            className="rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">數量</span>
            <QuantityStepper
              name="qty"
              min={1}
              max={99}
              defaultValue={1}
              size="sm"
              required
              ariaLabel="數量"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-xs text-muted-foreground">
              金額{prefix ? ` ${prefix}` : ""}
            </span>
            <input
              name="amount"
              inputMode="decimal"
              pattern="^\d+(\.\d{1,2})?$"
              required
              placeholder="0.00"
              className="rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
        </div>
        <button
          type="submit"
          className="self-start rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          新增
        </button>
      </form>
    </details>
  );
}
