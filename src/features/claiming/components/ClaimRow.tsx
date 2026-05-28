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
  setShareCountAction,
  toggleClaimAction,
} from "@/features/claiming/server/actions";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { getOrCreateDeviceToken } from "@/features/identity/deviceToken";
import { identityColor } from "@/features/identity/identityColor";
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
  shareCount: number;
  claimers: Claimer[];
  /** The identity this row's checkbox claims FOR — the caller's own
   *  identity in self-service mode, or the owner's selected "acting
   *  as" person. Sent to the server as `targetIdentityId`. */
  actingIdentityId: string;
  /** Owner sees an inline 份數 editor on every line (the receipt
   *  prints multipacks as "1x" — only the payer knows the real split). */
  isOwner: boolean;
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
  shareCount,
  claimers,
  actingIdentityId,
  isOwner,
  currency,
}: Props) {
  const multiShare = shareCount > 1;
  // Per-share unit price, rounded for display only — the settlement
  // math stays exact via largest-remainder in shareMath.
  const unitCents = multiShare
    ? Math.round(netCents / shareCount)
    : netCents;
  const token = useSyncExternalStore(
    subscribeNoop,
    getTokenSnapshot,
    getServerTokenSnapshot,
  );
  const iClaimed = claimers.some((c) => c.identityId === actingIdentityId);
  const myWeight =
    claimers.find((c) => c.identityId === actingIdentityId)?.weight ?? 1;

  // 防呆 — more shares claimed than the line was split into. Applies to
  // EVERY line, not just multi-share ones: a shareCount=1 line with two
  // claimers is the canonical over-claim (gating this on `multiShare`
  // was a bug — the warning never fired for the most common case). Not
  // blocked (shareMath still resolves via denom = max(shareCount,
  // Σweights)), but flagged so the owner notices a double-take / that a
  // 份數 needs bumping.
  const totalClaimedShares = claimers.reduce((s, c) => s + c.weight, 0);
  const overClaimed = totalClaimedShares > shareCount;

  // Claim-status colour cue on the row's left edge:
  //   none  → amber (still needs claiming)
  //   part  → amber (a multi-share line not fully taken)
  //   full  → emerald (done)
  const fullyClaimed =
    claimers.length > 0 && totalClaimedShares >= shareCount;
  const statusBorder = overClaimed
    ? "border-l-4 border-l-rose-500"
    : claimers.length === 0 || !fullyClaimed
      ? "border-l-4 border-l-amber-400"
      : "border-l-4 border-l-emerald-400";

  const toggleBound = toggleClaimAction.bind(null, linkId, lineId);
  const weightBound = setClaimWeightAction.bind(null, linkId, lineId);
  const shareCountBound = setShareCountAction.bind(null, linkId, lineId);

  return (
    <li
      role="listitem"
      data-claimed={iClaimed ? "true" : undefined}
      id={`claim-line-${lineNo}`}
      className={`px-4 py-2 border-t first:border-t-0 border-border flex items-center gap-3 ${statusBorder}`}
    >
      <form action={toggleBound}>
        {token ? (
          <input type="hidden" name="deviceToken" value={token} />
        ) : null}
        <input
          type="hidden"
          name="targetIdentityId"
          value={actingIdentityId}
        />
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
            共 {shareCount} 份 · 每份 {formatCents(unitCents, { currency })}
          </span>
        ) : null}
        {isOwner ? (
          <form
            action={shareCountBound}
            className="mt-0.5 flex items-center gap-1"
          >
            {token ? (
              <input type="hidden" name="deviceToken" value={token} />
            ) : null}
            <label
              htmlFor={`sc-${lineId}`}
              className="text-xs text-muted-foreground"
            >
              拆
            </label>
            <QuantityStepper
              id={`sc-${lineId}`}
              name="shareCount"
              min={1}
              max={99}
              defaultValue={shareCount}
              size="xs"
              disabled={!token}
              autoSubmit
              ariaLabel="拆幾份"
            />
            <span className="text-xs text-muted-foreground">份</span>
            {/* Plain <noscript> fallback — if JS is off, stepper can't
                auto-submit so we still expose a submit button. */}
            <noscript>
              <button
                type="submit"
                className="text-xs text-primary underline underline-offset-2"
              >
                更新
              </button>
            </noscript>
          </form>
        ) : null}
        {claimers.length > 0 ? (
          <span className="block text-xs truncate">
            {claimers.map((c, i) => (
              <span key={c.identityId}>
                {i > 0 ? (
                  <span className="text-muted-foreground">、</span>
                ) : null}
                <span
                  className={`font-medium ${identityColor(c.identityId).text}`}
                >
                  {c.identityName}
                  {c.weight > 1 ? `×${c.weight}` : ""}
                </span>
              </span>
            ))}
          </span>
        ) : (
          <span className="block text-xs text-amber-700 dark:text-amber-300 italic">
            尚未認領
          </span>
        )}
        {overClaimed ? (
          <span className="block text-xs font-medium text-rose-700 dark:text-rose-400">
            ⚠ 超額認領：已認 {totalClaimedShares} 份 / 共 {shareCount} 份（把「拆」改成 {totalClaimedShares} 份，或取消多餘的認領）
          </span>
        ) : null}
      </span>
      {iClaimed ? (
        <form action={weightBound} className="flex items-center gap-1">
          {token ? (
            <input type="hidden" name="deviceToken" value={token} />
          ) : null}
          <input
            type="hidden"
            name="targetIdentityId"
            value={actingIdentityId}
          />
          <label
            className={multiShare ? "text-xs text-muted-foreground" : "sr-only"}
            htmlFor={`w-${lineId}`}
          >
            {multiShare ? "拿幾份" : "我的份額"}
          </label>
          <QuantityStepper
            id={`w-${lineId}`}
            name="weight"
            min={1}
            max={1000}
            defaultValue={myWeight}
            size="xs"
            disabled={!token}
            autoSubmit
            ariaLabel={multiShare ? "拿幾份" : "我的份額"}
          />
          <noscript>
            <button
              type="submit"
              className="text-xs text-primary underline underline-offset-2"
            >
              更新
            </button>
          </noscript>
        </form>
      ) : null}
      <span className="tabular-nums text-sm font-semibold shrink-0">
        {formatCents(netCents, { currency })}
      </span>
    </li>
  );
}
