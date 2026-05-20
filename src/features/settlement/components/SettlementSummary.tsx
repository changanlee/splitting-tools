/**
 * Story 5.2 — settlement summary card. Server Component; renders
 * per-identity amount table + pending/orphan footer.
 */
import { formatCents } from "@/features/reconciliation/lib/formatCents";

interface Props {
  perIdentity: { identityId: string; name: string; cents: number }[];
  pendingCents: number;
  orphanIrcCents: number;
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
}

export function SettlementSummary({
  perIdentity,
  pendingCents,
  orphanIrcCents,
  parsedSumCents,
  printedTotalCents,
  unverified,
}: Props) {
  const headerTotal = printedTotalCents ?? parsedSumCents;
  return (
    <article className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 text-card-foreground">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">結算結果</h2>
        <span className="tabular-nums text-lg font-bold">
          {formatCents(headerTotal)}
        </span>
      </header>
      {unverified ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          ⚠ 此分帳未經對帳驗證
        </p>
      ) : null}
      {perIdentity.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          尚未有人認領。
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {perIdentity.map((p) => (
            <li
              key={p.identityId}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span>{p.name}</span>
              <span className="tabular-nums font-semibold">
                {formatCents(p.cents)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pendingCents > 0 || orphanIrcCents !== 0 ? (
        <footer className="border-t border-border pt-2 flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
          {pendingCents > 0 ? (
            <div>待認領 {formatCents(pendingCents)}（付款人吸收）</div>
          ) : null}
          {orphanIrcCents !== 0 ? (
            <div>孤兒 IRC {formatCents(orphanIrcCents)}</div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
