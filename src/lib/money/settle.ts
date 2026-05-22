/**
 * 🔴 Story 5.1 — FR50 deterministic settlement (PURE, NO IO).
 *
 * Architecture L390-401 designates `src/lib/money/settle.ts` as the
 * single source of truth for the settlement math. The contract is:
 *
 *     Σ byIdentity + pendingCents + orphanIrcCents == parsedSumCents
 *
 * That equality is the CI deployment-gate invariant (regression-
 * invariants.test.ts `settlement_sum == parsed_sum`). It MUST hold
 * over every possible (lines, claims, weights, orphans) input.
 *
 * Strategy:
 *   - For each claimable line with ≥1 claimer, distribute netCents
 *     across claimers by weight using largest-remainder rounding
 *     (delegated to computeSubtotals, already proven in shareMath).
 *   - Unclaimed claimable lines flow into `pendingCents` — the payer
 *     either absorbs them (Story 5.4) or surfaces them to chase.
 *   - Orphan IRC lines (negative cents, not attributed to any parent)
 *     flow into `orphanIrcCents`. Story 2.4 can re-bind them to fold
 *     into a parent's net; until then they sit in their own bucket so
 *     parsed_sum still reconciles.
 *
 * Deterministic: same inputs → same outputs (the largest-remainder
 * tiebreak is by lexicographic identityId in shareMath, AC4 of 4.5).
 * Stable sort: byIdentity Map iteration order matches insertion order
 * which is line-then-claim order.
 */
import {
  computeSubtotals,
  type ClaimForShare,
  type LineForShare,
} from "@/features/claiming/shareMath";

export interface SettleLine {
  id: string;
  netCents: number;
  /** receipt_lines.share_count — drives the under-claim spillover in
   *  shareMath when Σweights < shareCount. */
  shareCount: number;
  isIrc: boolean;
  claimable: boolean;
  orphan: boolean;
}

export interface SettleClaim {
  receiptLineId: string;
  identityId: string;
  weight: number;
}

export interface SettleResult {
  /** identityId → integer cents owed. */
  byIdentity: Map<string, number>;
  /** Claimable lines with NO claimer — payer to absorb / chase. */
  pendingCents: number;
  /** Orphan IRC lines (negative) — sit here until 2.4 re-bind. */
  orphanIrcCents: number;
  /** Per (identity, line) cents — drives the "who claimed what" UI. */
  perLine: { identityId: string; lineId: string; cents: number }[];
}

export function settle(
  lines: SettleLine[],
  claims: SettleClaim[],
): SettleResult {
  // Partition: claimable non-IRC lines for the share math; orphan IRC
  // siphoned into its own pool.
  const claimableLines: LineForShare[] = [];
  let orphanIrcCents = 0;
  for (const l of lines) {
    if (l.isIrc && l.orphan) {
      orphanIrcCents += l.netCents; // IRC net == own gross (negative)
      continue;
    }
    if (l.isIrc) continue; // non-orphan IRC: already folded into its parent's net
    if (!l.claimable) continue;
    claimableLines.push({
      id: l.id,
      netCents: l.netCents,
      shareCount: l.shareCount,
    });
  }

  // Subtotals over CLAIMED lines (with per-line under-claim spillover).
  const claimsForMath: ClaimForShare[] = claims.map((c) => ({
    receiptLineId: c.receiptLineId,
    identityId: c.identityId,
    weight: c.weight,
  }));
  const subtotals = computeSubtotals(claimableLines, claimsForMath);

  // Pending = fully-unclaimed lines + the under-claim spillover from
  // partially-claimed multi-share lines. Both flow into the same
  // "payer absorbs" bucket; conservation Σ byIdentity + pending +
  // orphan == Σ net still holds.
  let pendingCents = subtotals.pendingFromUnderclaim;
  const claimedLineIds = new Set(claims.map((c) => c.receiptLineId));
  for (const l of claimableLines) {
    if (!claimedLineIds.has(l.id)) pendingCents += l.netCents;
  }

  return {
    byIdentity: subtotals.byIdentity,
    pendingCents,
    orphanIrcCents,
    perLine: subtotals.perLine,
  };
}

/** Conservation accessor — Σ byIdentity + pending + orphan. */
export function settlementSum(result: SettleResult): number {
  let s = 0;
  for (const v of result.byIdentity.values()) s += v;
  return s + result.pendingCents + result.orphanIrcCents;
}
