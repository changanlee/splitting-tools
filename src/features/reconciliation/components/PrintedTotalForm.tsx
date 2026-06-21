/**
 * Story 2.5 — manual printed-total input (FR13). Native HTML form
 * posting to setPrintedTotalAction. Shows the current value (if any)
 * as the default; an empty submit clears the field and reverts the
 * SubtotalBar to `awaiting_printed_total`.
 *
 * UX: collapsed under a <details> so the page doesn't lead with an
 * input — most receipts will be auto-readable from the printed total
 * once Story 1.4 produces it. v1 ships before that, so this is the
 * payer's escape hatch.
 */
import { setPrintedTotalAction } from "@/features/reconciliation/server/actions";
import {
  CURRENCY_PREFIX,
  currencyDecimals,
  formatAmountPlain,
} from "@/features/reconciliation/lib/formatCents";

interface Props {
  linkId: string;
  currentCents: number | null;
  currency: string | null;
}

export function PrintedTotalForm({ linkId, currentCents, currency }: Props) {
  const bound = setPrintedTotalAction.bind(null, linkId);
  const summaryLabel =
    currentCents === null
      ? "📝 手動輸入印製總額"
      : `📝 已手動輸入印製總額（可調整）`;
  const prefix =
    currency && currency.length > 0
      ? (CURRENCY_PREFIX[currency.toUpperCase()] ?? "")
      : "";
  // Currency-aware input shape: KRW/JPY accept integers only, 2-decimal
  // currencies accept an optional ".dd".
  const decimals = currencyDecimals(currency);
  const pattern =
    decimals === 0 ? "^\\d*$" : `^(\\d+(\\.\\d{1,${decimals}})?)?$`;
  const placeholder = decimals === 0 ? "132580" : "2208.50";
  const defaultValue =
    currentCents === null ? "" : formatAmountPlain(currentCents, currency);
  return (
    <details open={currentCents === null} className="border-t border-border">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-accent/50">
        {summaryLabel}
      </summary>
      <form action={bound} className="px-4 py-3 flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            印製總額{prefix ? ` ${prefix}` : ""}（空白＝清除）
          </span>
          <input
            name="printedTotal"
            inputMode={decimals === 0 ? "numeric" : "decimal"}
            pattern={pattern}
            defaultValue={defaultValue}
            placeholder={placeholder}
            className="rounded border border-input bg-background px-2 py-1.5 text-sm tabular-nums"
          />
        </label>
        <button
          type="submit"
          className="self-start rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          {currentCents === null ? "套用" : "更新"}
        </button>
      </form>
    </details>
  );
}
