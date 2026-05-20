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

interface Props {
  linkId: string;
  currentCents: number | null;
}

function dollarsString(cents: number | null): string {
  if (cents === null) return "";
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${cents < 0 ? "-" : ""}${whole}.${frac}`;
}

export function PrintedTotalForm({ linkId, currentCents }: Props) {
  const bound = setPrintedTotalAction.bind(null, linkId);
  const summaryLabel =
    currentCents === null
      ? "📝 手動輸入印製總額（FR13 逃生口）"
      : `📝 已手動輸入印製總額（可調整）`;
  return (
    <details open={currentCents === null} className="border-t border-border">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-accent/50">
        {summaryLabel}
      </summary>
      <form action={bound} className="px-4 py-3 flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            印製總額 NT$（空白＝清除）
          </span>
          <input
            name="printedTotal"
            inputMode="decimal"
            pattern="^(\d+(\.\d{1,2})?)?$"
            defaultValue={dollarsString(currentCents)}
            placeholder="2208.50"
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
