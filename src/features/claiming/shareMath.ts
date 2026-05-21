/**
 * Story 4.4/4.5 — pure per-identity share calculation.
 *
 * Given a list of claims `{ receiptLineId, identityId, weight }` plus
 * each claimable line's `netCents` and `qty`, compute every identity's
 * subtotal in INTEGER CENTS using the largest-remainder method to
 * preserve `Σ subtotal + pendingFromUnderclaim == Σ net (claimed)`.
 *
 * Weight semantics (2026-05-21 refinement after live walkthrough):
 *   weight is interpreted as "units consumed out of this line's qty"
 *   when qty > Σweights. The remainder (qty - Σweights worth of cents)
 *   spills into `pendingFromUnderclaim` so the payer absorbs unclaimed
 *   portions of bundle-pack lines (e.g. 4-pack 汽水 ¥99.90 with a
 *   single claimer weight=2 → claimer ¥49.95, pending ¥49.95). When
 *   Σweights ≥ qty (the common single-bottle case), weight collapses
 *   back to the old relative-share model. Backward compatible: a line
 *   with qty=1 and Σweights ≥ 1 behaves exactly as before.
 *
 * This is the deterministic precursor to Story 5.1's full settlement,
 * kept self-contained so the claim board can show "我應付 ¥X" without
 * re-running the settlement engine on every read.
 */

export interface LineForShare {
  /** receipt_lines.id */
  id: string;
  /** Integer cents — the net (post-IRC) amount of this line. */
  netCents: number;
  /** Logical unit count for the line (qty on the receipt; payer can
   *  edit on review for bundle packs). Used as the under-claim divisor
   *  floor. Must be ≥ 1. */
  qty: number;
}

export interface ClaimForShare {
  receiptLineId: string;
  identityId: string;
  weight: number; // ≥ 1
}

/** identityId → integer cents */
export type SubtotalsByIdentity = Map<string, number>;

export interface SubtotalsResult {
  byIdentity: SubtotalsByIdentity;
  /** Cents from claimed-but-under-claimed lines (Σweights < qty);
   *  the payer absorbs these into the settlement's `pendingCents`. */
  pendingFromUnderclaim: number;
}

/**
 * Distribute each line's `netCents` across its claimers by weight,
 * with largest-remainder rounding so the sum is exact. A line with
 * no claimers contributes 0 here (settle.ts surfaces it as pending).
 * A line with claimers whose total weight is less than `qty` only
 * distributes the fraction `Σweights/qty` of `netCents`; the rest
 * spills to `pendingFromUnderclaim`.
 */
export function computeSubtotals(
  lines: LineForShare[],
  allClaims: ClaimForShare[],
): SubtotalsResult {
  const byIdentity: SubtotalsByIdentity = new Map();
  let pendingFromUnderclaim = 0;

  // Group claims by line for O(1) lookup.
  const claimsByLine = new Map<string, ClaimForShare[]>();
  for (const c of allClaims) {
    const list = claimsByLine.get(c.receiptLineId) ?? [];
    list.push(c);
    claimsByLine.set(c.receiptLineId, list);
  }

  for (const line of lines) {
    const lineClaims = claimsByLine.get(line.id);
    if (!lineClaims || lineClaims.length === 0) continue;
    const totalWeight = lineClaims.reduce((a, c) => a + c.weight, 0);
    if (totalWeight <= 0) continue;

    // Under-claim model: when qty > Σweights, only `Σw/qty` of the
    // line is owed by claimers; the rest is pending. When Σweights
    // ≥ qty, this collapses to the old "distribute the whole line".
    const denom = Math.max(line.qty, totalWeight);
    const claimerPool = Math.trunc((line.netCents * totalWeight) / denom);
    pendingFromUnderclaim += line.netCents - claimerPool;
    if (claimerPool === 0) continue;

    // First pass: floor allocation per claimer; track fractional
    // remainders for the largest-remainder tiebreak. We allocate the
    // claimerPool (≤ netCents) among claimers proportional to weight.
    const allocations: {
      identityId: string;
      floor: number;
      remainder: number;
    }[] = lineClaims.map((c) => {
      const product = claimerPool * c.weight;
      const floor = Math.trunc(product / totalWeight);
      const remainder =
        ((product % totalWeight) + totalWeight) % totalWeight;
      return { identityId: c.identityId, floor, remainder };
    });

    // Distribute the leftover cents (claimerPool - Σ floor) to
    // claimers with the largest remainder; ties broken by identityId
    // (lexicographic) for stable output across calls.
    const sumOfFloors = allocations.reduce((a, x) => a + x.floor, 0);
    let leftover = claimerPool - sumOfFloors;
    const ordered = [...allocations].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.identityId < b.identityId
        ? -1
        : a.identityId > b.identityId
          ? 1
          : 0;
    });
    const bumped = new Map<string, number>();
    for (const a of ordered) {
      if (leftover === 0) break;
      const step = leftover > 0 ? 1 : -1;
      bumped.set(a.identityId, (bumped.get(a.identityId) ?? 0) + step);
      leftover -= step;
    }

    for (const a of allocations) {
      const delta = a.floor + (bumped.get(a.identityId) ?? 0);
      byIdentity.set(
        a.identityId,
        (byIdentity.get(a.identityId) ?? 0) + delta,
      );
    }
  }

  return { byIdentity, pendingFromUnderclaim };
}

/** Conservation helper — Σ subtotal across all identities. */
export function sumSubtotals(s: SubtotalsByIdentity): number {
  let total = 0;
  for (const v of s.values()) total += v;
  return total;
}
