/**
 * Story 3.2 — 防詐騙訊息卡 (MessageCard). Renders the share-message
 * content the payer can copy/share; the card itself shows the same
 * fields so the payer knows what's being shared BEFORE they share.
 *
 * UX spec L537-539 wants a non-bare-URL share so recipients can tell
 * this is a split-bill not a scam phish — the card carries: 日期、
 * 總額、品項數、付款人(placeholder)、連結。
 *
 * Server Component — no client state.
 */
import { formatCents } from "@/features/reconciliation/lib/formatCents";

interface Props {
  shareUrl: string;
  createdAt: Date;
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
  lineCount: number;
  currency: string | null;
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function MessageCard({
  shareUrl,
  createdAt,
  parsedSumCents,
  printedTotalCents,
  unverified,
  lineCount,
  currency,
}: Props) {
  const totalToShow = printedTotalCents ?? parsedSumCents;
  return (
    <article
      data-share-card
      className="rounded-lg border border-border bg-card p-4 text-card-foreground flex flex-col gap-2"
      aria-label="分享卡片預覽"
    >
      <h2 className="text-base font-semibold">這次的分帳</h2>
      <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
        <dt className="text-muted-foreground">日期</dt>
        <dd className="tabular-nums">{formatDate(createdAt)}</dd>
        <dt className="text-muted-foreground">總額</dt>
        <dd className="tabular-nums font-medium">{formatCents(totalToShow, { currency })}</dd>
        <dt className="text-muted-foreground">品項</dt>
        <dd>{lineCount} 行</dd>
        <dt className="text-muted-foreground">付款人</dt>
        <dd className="text-muted-foreground italic">（未設定，Epic 4 處理）</dd>
        {unverified ? (
          <>
            <dt className="text-amber-700 dark:text-amber-300">⚠</dt>
            <dd className="text-amber-700 dark:text-amber-300">
              此分帳未經對帳驗證
            </dd>
          </>
        ) : null}
      </dl>
      <div className="pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">分帳連結</span>
        <p className="text-xs break-all">{shareUrl}</p>
      </div>
    </article>
  );
}

/** Build the plain-text share body — used by both copy + Web Share. */
export function buildShareText(args: {
  shareUrl: string;
  createdAt: Date;
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
  lineCount: number;
  currency: string | null;
}): string {
  const totalToShow = args.printedTotalCents ?? args.parsedSumCents;
  return [
    `📑 ${formatDate(args.createdAt)} 的分帳`,
    `總額 ${formatCents(totalToShow, { currency: args.currency })} ／ ${args.lineCount} 行品項`,
    args.unverified ? "⚠ 未經對帳驗證" : null,
    `連結：${args.shareUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}
