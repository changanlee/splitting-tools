"use client";

/**
 * Story 4.4/4.5 + Feature B — claim board.
 *
 * Two modes, same row rendering:
 *  - Member (non-owner): claims for the caller's own identity only.
 *  - Owner (the payer): an "acting as" selector lets them claim for
 *    ANY person, and an add-person control creates tokenless
 *    identities to pre-allocate to (the friend binds their device
 *    later via the "是不是你" picker). Owner authz is enforced
 *    server-side in the claim actions; this is just the UI surface.
 */
import { useState, useSyncExternalStore } from "react";

import {
  computeSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";
import { ClaimRow } from "@/features/claiming/components/ClaimRow";
import { undoLastClaimAction } from "@/features/claiming/server/actions";
import {
  addPersonAction,
  removePersonAction,
} from "@/features/identity/server/actions";
import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { formatCents } from "@/features/reconciliation/lib/formatCents";

function subscribeNoop(): () => void {
  return () => {};
}
function tokenSnap(): string | null {
  return getOrCreateDeviceToken();
}
function tokenServerSnap(): string | null {
  return null;
}

interface LineProp {
  id: string;
  lineNo: number;
  description: string;
  netCents: number;
  shareCount: number;
}

interface ClaimProp {
  receiptLineId: string;
  identityId: string;
  identityName: string;
  weight: number;
}

interface Person {
  id: string;
  name: string;
}

interface Props {
  linkId: string;
  /** Caller is the session creator (payer) → owner mode. */
  isOwner: boolean;
  /** Every identity on the session — the owner's act-as options. */
  allIdentities: Person[];
  /** Caller's own device-bound identity; null for an owner who has
   *  not picked/created their own identity yet. */
  myIdentityId: string | null;
  /** Toast cues from the add/remove-person redirects. */
  addedName: string | null;
  removedName: string | null;
  lines: LineProp[];
  claims: ClaimProp[];
  unverified: boolean;
  currency: string | null;
}

export function ClaimBoardBody({
  linkId,
  isOwner,
  allIdentities,
  myIdentityId,
  addedName,
  removedName,
  lines,
  claims,
  unverified,
  currency,
}: Props) {
  const token = useSyncExternalStore(
    subscribeNoop,
    tokenSnap,
    tokenServerSnap,
  );

  // Who the board is currently claiming FOR. Members are locked to
  // their own identity; owners can switch.
  const defaultActing =
    myIdentityId ?? (isOwner ? (allIdentities[0]?.id ?? "") : "");
  const [actingId, setActingId] = useState(defaultActing);

  const linesForMath: LineForShare[] = lines.map((l) => ({
    id: l.id,
    netCents: l.netCents,
    shareCount: l.shareCount,
  }));
  const claimsForMath: ClaimForShare[] = claims.map((c) => ({
    receiptLineId: c.receiptLineId,
    identityId: c.identityId,
    weight: c.weight,
  }));
  const subtotals = computeSubtotals(linesForMath, claimsForMath);
  const actingSubtotal = subtotals.byIdentity.get(actingId) ?? 0;
  const actingName =
    allIdentities.find((p) => p.id === actingId)?.name ?? "";

  const pending = lines.filter(
    (l) => !claims.some((c) => c.receiptLineId === l.id),
  );

  const undoBound = undoLastClaimAction.bind(null, linkId);
  const addPersonBound = addPersonAction.bind(null, linkId);
  const removePersonBound = removePersonAction.bind(null, linkId);

  const claimsByLine = new Map<string, ClaimProp[]>();
  for (const c of claims) {
    const list = claimsByLine.get(c.receiptLineId) ?? [];
    list.push(c);
    claimsByLine.set(c.receiptLineId, list);
  }

  // Owner with zero people yet — can't claim for anyone; show only
  // the add-person prompt.
  const noPeopleYet = isOwner && allIdentities.length === 0;

  return (
    <section className="flex flex-col gap-3">
      {addedName ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          ✓ 已新增「{addedName}」
        </p>
      ) : null}
      {removedName ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          已移除「{removedName}」
        </p>
      ) : null}
      {isOwner ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            你是發起人 — 可以幫每個人勾選認領，之後分享連結讓他們確認或修改。
          </p>
          {!noPeopleYet ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <span className="shrink-0">目前幫</span>
                <select
                  value={actingId}
                  onChange={(e) => setActingId(e.target.value)}
                  className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {allIdentities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="shrink-0">認領</span>
              </label>
              <details>
                <summary className="cursor-pointer text-xs text-destructive">
                  ▸ 移除「{actingName}」
                </summary>
                <form action={removePersonBound} className="mt-2">
                  {token ? (
                    <input
                      type="hidden"
                      name="deviceToken"
                      value={token}
                    />
                  ) : null}
                  <input
                    type="hidden"
                    name="targetIdentityId"
                    value={actingId}
                  />
                  <p className="mb-2 text-xs text-muted-foreground">
                    會一併刪掉「{actingName}」的所有認領，無法復原。
                  </p>
                  <button
                    type="submit"
                    className="rounded bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90"
                  >
                    確認移除
                  </button>
                </form>
              </details>
            </>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-primary">
              ＋ 新增一個人
            </summary>
            <form
              action={addPersonBound}
              className="mt-2 flex items-end gap-2"
            >
              {token ? (
                <input type="hidden" name="deviceToken" value={token} />
              ) : null}
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-muted-foreground">名字</span>
                <input
                  name="name"
                  maxLength={30}
                  required
                  placeholder="例：阿美"
                  className="rounded border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                新增
              </button>
            </form>
          </details>
        </div>
      ) : null}

      {!noPeopleYet ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-0 z-10 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm flex items-center gap-3 tabular-nums"
        >
          <span>{isOwner ? `${actingName} 應付` : `嗨 ${actingName}，我應付`}</span>
          <span className="ml-auto text-lg font-semibold">
            {formatCents(actingSubtotal, { currency })}
          </span>
        </div>
      ) : null}

      {unverified ? (
        <p
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          ⚠ 這份分帳未經對帳驗證（FR15）。
        </p>
      ) : null}

      {noPeopleYet ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">
          先用上面「＋ 新增一個人」加入要分帳的人，就能開始勾選認領。
        </p>
      ) : (
        <ol className="rounded-md border border-border overflow-hidden">
          {lines.map((l) => (
            <ClaimRow
              key={l.id}
              linkId={linkId}
              lineId={l.id}
              lineNo={l.lineNo}
              description={l.description}
              netCents={l.netCents}
              shareCount={l.shareCount}
              currency={currency}
              claimers={(claimsByLine.get(l.id) ?? []).map((c) => ({
                identityId: c.identityId,
                identityName: c.identityName,
                weight: c.weight,
              }))}
              actingIdentityId={actingId}
            />
          ))}
        </ol>
      )}

      {pending.length > 0 && !noPeopleYet ? (
        <p className="text-xs text-muted-foreground">
          目前有 {pending.length} 行尚未認領，會由付款人吸收。
        </p>
      ) : null}

      {!noPeopleYet ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <a
            href={`/splits/${linkId}/settle`}
            className="rounded bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            ✓ 完成認領 — 查看分帳結算 →
          </a>
          <form action={undoBound}>
            {token ? (
              <input type="hidden" name="deviceToken" value={token} />
            ) : null}
            <input
              type="hidden"
              name="targetIdentityId"
              value={actingId}
            />
            <button
              type="submit"
              disabled={!token}
              className="text-xs text-primary underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              ↶ 撤銷上一個
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
