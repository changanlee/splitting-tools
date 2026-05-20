/**
 * Story 2.4 — IRC re-bind form (FR12). Server Component, server-action
 * driven. Drops a <select> of candidate parent product lines + an
 * 「orphan」option; submit re-folds the whole session.
 */
import { rebindIrcAction } from "@/features/reconciliation/server/actions";
import type { ReceiptLineView } from "@/features/reconciliation/server/summary";

interface Props {
  linkId: string;
  ircLine: ReceiptLineView;
  candidates: ReceiptLineView[];
}

export function IrcRebindForm({ linkId, ircLine, candidates }: Props) {
  const bound = rebindIrcAction.bind(null, linkId, ircLine.id);
  return (
    <li
      role="listitem"
      data-line-type="irc-rebind"
      id={`line-${ircLine.lineNo}`}
      className="px-4 py-3 border-t first:border-t-0 border-border bg-amber-50/40 dark:bg-amber-950/20 scroll-mt-20"
    >
      <form
        action={bound}
        className="flex flex-col gap-2 text-sm"
        aria-label={`IRC 折扣（第 ${ircLine.lineNo} 行）改綁`}
      >
        <span className="text-xs text-muted-foreground">
          IRC 折扣 {ircLine.description} ／ 改綁至：
        </span>
        <select
          name="parentId"
          defaultValue={ircLine.ircAttributedTo ?? "orphan"}
          className="rounded border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="orphan">— 尚未對應母品項（orphan）—</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              第 {c.lineNo} 行：{c.description}
            </option>
          ))}
        </select>
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
    </li>
  );
}
