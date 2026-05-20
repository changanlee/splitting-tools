/**
 * Story 4.4/4.5 — pure per-identity share calculation.
 *
 * Given a list of claims `{ receiptLineId, identityId, weight }` plus
 * each claimable line's `netCents`, compute every identity's
 * subtotal in INTEGER CENTS using the largest-remainder method to
 * preserve `Σ subtotal == Σ net (claimed)`. This is the deterministic
 * pre-curser to Story 5.1's full settlement — kept self-contained so
 * the claim board can show "我應付 NT$X" without re-running the
 * settlement engine on every read.
 */

export interface LineForShare {
  /** receipt_lines.id */
  id: string;
  /** Integer cents — the net (post-IRC) amount of this line. */
  netCents: number;
}

export interface ClaimForShare {
  receiptLineId: string;
  identityId: string;
  weight: number; // ≥ 1
}

/** identityId → integer cents */
export type SubtotalsByIdentity = Map<string, number>;

/**
 * Distribute each line's `netCents` across its claimers by weight,
 * with largest-remainder rounding so the sum is exact. A line with
 * no claimers contributes 0 to anyone's subtotal (it's `pending` —
 * Story 4.7 surfaces those to the payer).
 */
export function computeSubtotals(
  lines: LineForShare[],
  allClaims: ClaimForShare[],
): SubtotalsByIdentity {
  const subtotals = new Map<string, number>();

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

    // First pass: floor allocation per claimer; track fractional
    // remainders for the largest-remainder tiebreak.
    const allocations: { identityId: string; floor: number; remainder: number }[] =
      lineClaims.map((c) => {
        // numerator * weight may overflow if line is huge — for our
        // domain (max ~99,999_999 cents × max weight 1000) the
        // intermediate stays well under 2^53. No bigint needed.
        const product = line.netCents * c.weight;
        const floor = Math.trunc(product / totalWeight);
        const remainder = ((product % totalWeight) + totalWeight) % totalWeight;
        return { identityId: c.identityId, floor, remainder };
      });

    // Distribute the leftover cents (line.netCents - Σ floor) to
    // claimers with the largest remainder; ties broken by identityId
    // (lexicographic) for stable output across calls.
    const sumOfFloors = allocations.reduce((a, x) => a + x.floor, 0);
    let leftover = line.netCents - sumOfFloors;
    const ordered = [...allocations].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return a.identityId < b.identityId ? -1 : a.identityId > b.identityId ? 1 : 0;
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
      subtotals.set(
        a.identityId,
        (subtotals.get(a.identityId) ?? 0) + delta,
      );
    }
  }

  return subtotals;
}

/** Conservation helper — Σ subtotal for the claimed lines. */
export function sumSubtotals(s: SubtotalsByIdentity): number {
  let total = 0;
  for (const v of s.values()) total += v;
  return total;
}
