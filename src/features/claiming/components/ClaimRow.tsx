"use client";

/**
 * Story 4.4 — single row's claim form. Client component because it
 * stamps the device token from localStorage into the hidden field.
 * The button is the form's submit — toggles claim on/off; on success
 * the server revalidates and the parent server-rendered list re-runs.
 *
 * 4.5 weight controls live next to the button (only when claimed).
 */
import { useSyncExternalStore } from "react";

import {
  setClaimWeightAction,
  toggleClaimAction,
} from "@/features/claiming/server/actions";
import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { formatCents } from "@/features/reconciliation/lib/formatCents";

interface Claimer {
  identityId: string;
  identityName: string;
  weight: number;
}

interface Props {
  linkId: string;
  lineId: string;
  lineNo: number;
  description: string;
  netCents: number;
  /** Share count — when > 1 the row shows the per-share unit price
   *  and the weight input means "how many shares you took". */
  qty: number;
  claimers: Claimer[];
  myIdentityId: string;
  currency: string | null;
}

function subscribeNoop(): () => void {
  return () => {};
}
function getTokenSnapshot(): string | null {
  return getOrCreateDeviceToken();
}
function getServerTokenSnapshot(): string | null {
  return null;
}

export function ClaimRow({
  linkId,
  lineId,
  lineNo,
  description,
  netCents,
  qty,
  claimers,
  myIdentityId,
  currency,
}: Props) {
  const multiShare = qty > 1;
  // Per-share unit price, rounded for display only — the settlement
  // math stays exact via largest-remainder in shareMath.
  const unitCents = multiShare ? Math.round(netCents / qty) : netCents;
  const token = useSyncExternalStore(
    subscribeNoop,
    getTokenSnapshot,
    getServerTokenSnapshot,
  );
  const iClaimed = claimers.some((c) => c.identityId === myIdentityId);
  const myWeight =
    claimers.find((c) => c.identityId === myIdentityId)?.weight ?? 1;

  const toggleBound = toggleClaimAction.bind(null, linkId, lineId);
  const weightBound = setClaimWeightAction.bind(null, linkId, lineId);

  return (
    <li
      role="listitem"
      data-claimed={iClaimed ? "true" : undefined}
      id={`claim-line-${lineNo}`}
      className="px-4 py-2 border-t first:border-t-0 border-border flex items-center gap-3"
    >
      <form action={toggleBound}>
        {token ? (
          <input type="hidden" name="deviceToken" value={token} />
        ) : null}
        <button
          type="submit"
          aria-label={iClaimed ? "取消認領" : "認領"}
          aria-pressed={iClaimed}
          disabled={!token}
          className="size-7 rounded border border-input bg-background flex items-center justify-center text-base hover:bg-accent disabled:opacity-50"
        >
          {iClaimed ? "✓" : ""}
        </button>
      </form>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{description}</span>
        {multiShare ? (
          <span className="block text-xs text-muted-foreground">
            共 {qty} 份 · 每份 {formatCents(unitCents, { currency })}
          </span>
        ) : null}
        {claimers.length > 0 ? (
          <span className="block text-xs text-muted-foreground truncate">
            {claimers
              .map((c) =>
                c.weight > 1 ? `${c.identityName}×${c.weight}` : c.identityName,
              )
              .join("、")}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground italic">
            尚未認領
          </span>
        )}
      </span>
      {iClaimed ? (
        <form action={weightBound} className="flex items-center gap-1">
          {token ? (
            <input type="hidden" name="deviceToken" value={token} />
          ) : null}
          <label
            className={multiShare ? "text-xs text-muted-foreground" : "sr-only"}
            htmlFor={`w-${lineId}`}
          >
            {multiShare ? "拿幾份" : "我的份額"}
          </label>
          <input
            id={`w-${lineId}`}
            name="weight"
            type="number"
            min="1"
            max="1000"
            step="1"
            defaultValue={myWeight}
            className="w-12 rounded border border-input bg-background px-1 py-0.5 text-xs tabular-nums text-center"
          />
          <button
            type="submit"
            disabled={!token}
            className="text-xs text-primary underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            更新
          </button>
        </form>
      ) : null}
      <span className="tabular-nums text-sm font-semibold shrink-0">
        {formatCents(netCents, { currency })}
      </span>
    </li>
  );
}
