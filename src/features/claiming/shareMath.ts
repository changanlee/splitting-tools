/**
 * Story 4.4/4.5 — pure per-identity share calculation.
 *
 * Weight model (confirmed 2026-05-21 with the user):
 *   - Every claimable line has a `qty` = how many SHARES it splits
 *     into. OCR seeds it; the payer can override it on the review page
 *     (e.g. a 4-pack 汽水 that scanned as qty=1 → set qty=4). The line's
 *     unit price is therefore `netCents / qty`.
 *   - Each claim carries a `weight` = how many shares that person took.
 *   - A claimer's subtotal for a line = `netCents × weight / denom`
 *     where `denom = max(qty, Σweights)`.
 *       · Σweights < qty  → the line is under-claimed; the unclaimed
 *         `qty − Σweights` shares spill into `pendingFromUnderclaim`
 *         (the payer absorbs them).
 *       · Σweights ≥ qty  → fully (or over-) claimed; `denom = Σweights`
 *         and the whole line is distributed by relative weight — the
 *         common single-item (qty=1) case collapses to exactly the
 *         old relative-share behaviour.
 *
 * Conservation: `Σ subtotal + pendingFromUnderclaim == Σ netCents`
 * over the claimed lines — integer cents, largest-remainder rounding.
 */

export interface LineForShare {
  /** receipt_lines.id */
  id: string;
  /** Integer cents — the net (post-IRC) amount of this line. */
  netCents: number;
  /** Share count the line splits into (receipt_lines.qty, ≥ 1). */
  qty: number;
}

export interface ClaimForShare {
  receiptLineId: string;
  identityId: string;
  weight: number; // ≥ 1 — shares this person took
}

/** identityId → integer cents */
export type SubtotalsByIdentity = Map<string, number>;

export interface SubtotalsResult {
  byIdentity: SubtotalsByIdentity;
  /** Cents from claimed-but-under-claimed lines (Σweights < qty) —
   *  the payer absorbs these into the settlement's `pendingCents`. */
  pendingFromUnderclaim: number;
}

/**
 * Distribute each line's `netCents` across its claimers by weight,
 * with largest-remainder rounding so the sum is exact. A line with no
 * claimers contributes 0 here (settle.ts surfaces it as fully pending).
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

    // denom ≥ totalWeight always; when qty exceeds it the surplus
    // shares are unclaimed and their cents go to pending.
    const denom = Math.max(line.qty, totalWeight);
    const claimerPool = Math.trunc((line.netCents * totalWeight) / denom);
    pendingFromUnderclaim += line.netCents - claimerPool;
    if (claimerPool === 0) continue;

    // Floor allocation per claimer over `claimerPool`; track the
    // fractional remainder for the largest-remainder tiebreak.
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

    // Distribute the leftover cents (claimerPool − Σ floor) to the
    // largest remainders; ties broken by identityId for determinism.
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
