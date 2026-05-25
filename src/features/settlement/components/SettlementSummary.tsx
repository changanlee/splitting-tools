/**
 * Story 5.2 — settlement summary card. Server Component; renders
 * per-identity amount table + pending/orphan footer.
 */
import { formatCents } from "@/features/reconciliation/lib/formatCents";
import { identityColor } from "@/features/identity/identityColor";

interface Props {
  perIdentity: {
    identityId: string;
    name: string;
    cents: number;
    items: { description: string; cents: number; weight: number }[];
  }[];
  pendingCents: number;
  orphanIrcCents: number;
  parsedSumCents: number;
  printedTotalCents: number | null;
  unverified: boolean;
  currency: string | null;
}

export function SettlementSummary({
  perIdentity,
  pendingCents,
  orphanIrcCents,
  parsedSumCents,
  printedTotalCents,
  unverified,
  currency,
}: Props) {
  const headerTotal = printedTotalCents ?? parsedSumCents;
  const fmt = (c: number) => formatCents(c, { currency });
  return (
    <article className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 text-card-foreground">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">結算結果</h2>
        <span className="tabular-nums text-lg font-bold">
          {fmt(headerTotal)}
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
            <li key={p.identityId} className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={`inline-block size-2.5 shrink-0 rounded-full ${identityColor(p.identityId).dot}`}
                  />
                  {p.name}
                </span>
                <span className="tabular-nums font-semibold">
                  {fmt(p.cents)}
                </span>
              </div>
              {p.items.length > 0 ? (
                <ul className="flex flex-col gap-0.5 pl-3 text-xs text-muted-foreground">
                  {p.items.map((it, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        {it.description}
                        {it.weight >= 2 ? (
                          <span className="ml-1 tabular-nums">
                            ×{it.weight}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {fmt(it.cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {pendingCents > 0 || orphanIrcCents !== 0 ? (
        <footer className="border-t border-border pt-2 flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
          {pendingCents > 0 ? (
            <div>待認領 {fmt(pendingCents)}（付款人吸收）</div>
          ) : null}
          {orphanIrcCents !== 0 ? (
            <div>孤兒 IRC {fmt(orphanIrcCents)}</div>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
