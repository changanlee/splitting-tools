"use client";

/**
 * Story 4.4/4.5 — claim board body. Client component because it
 * needs to compute "我應付 NT$X" using computeSubtotals (pure) on
 * the props the server pre-fetched, AND threads the device-token
 * into each row via ClaimRow.
 *
 * The board itself is dumb — no polling here (Story 4.8 owns the
 * board polling; we re-use the same server data for now).
 */
import {
  computeSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";
import { ClaimRow } from "@/features/claiming/components/ClaimRow";
import { formatCents } from "@/features/reconciliation/lib/formatCents";

interface LineProp {
  id: string;
  lineNo: number;
  description: string;
  netCents: number;
}

interface ClaimProp {
  receiptLineId: string;
  identityId: string;
  identityName: string;
  weight: number;
}

interface Props {
  linkId: string;
  myIdentityId: string;
  myName: string;
  lines: LineProp[];
  claims: ClaimProp[];
  unverified: boolean;
}

export function ClaimBoardBody({
  linkId,
  myIdentityId,
  myName,
  lines,
  claims,
  unverified,
}: Props) {
  const linesForMath: LineForShare[] = lines.map((l) => ({
    id: l.id,
    netCents: l.netCents,
  }));
  const claimsForMath: ClaimForShare[] = claims.map((c) => ({
    receiptLineId: c.receiptLineId,
    identityId: c.identityId,
    weight: c.weight,
  }));
  const subtotals = computeSubtotals(linesForMath, claimsForMath);
  const mySubtotal = subtotals.get(myIdentityId) ?? 0;

  // Pending = lines with no claimers (Story 4.7 will surface them
  // more prominently; here we just count + show).
  const pending = lines.filter(
    (l) => !claims.some((c) => c.receiptLineId === l.id),
  );

  // Group claims by line for the row props.
  const claimsByLine = new Map<string, ClaimProp[]>();
  for (const c of claims) {
    const list = claimsByLine.get(c.receiptLineId) ?? [];
    list.push(c);
    claimsByLine.set(c.receiptLineId, list);
  }

  return (
    <section className="flex flex-col gap-3">
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-10 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm flex items-center gap-3 tabular-nums"
      >
        <span>嗨 {myName}，我應付</span>
        <span className="ml-auto text-lg font-semibold">
          {formatCents(mySubtotal)}
        </span>
      </div>
      {unverified ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          ⚠ 這份分帳未經對帳驗證（FR15）。
        </p>
      ) : null}
      <ol className="rounded-md border border-border overflow-hidden">
        {lines.map((l) => (
          <ClaimRow
            key={l.id}
            linkId={linkId}
            lineId={l.id}
            lineNo={l.lineNo}
            description={l.description}
            netCents={l.netCents}
            claimers={(claimsByLine.get(l.id) ?? []).map((c) => ({
              identityId: c.identityId,
              identityName: c.identityName,
              weight: c.weight,
            }))}
            myIdentityId={myIdentityId}
          />
        ))}
      </ol>
      {pending.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          目前有 {pending.length} 行尚未認領（4.7 將更明顯地提醒付款人）。
        </p>
      ) : null}
    </section>
  );
}
