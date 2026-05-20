/**
 * Story 2.4 — pure IRC re-fold over a session's current line set.
 *
 * Given the lines as read from `receipt_lines` (with IRC's
 * `irc_attributed_to` already pointing at the desired parent — or
 * null for orphan), this returns a fresh list of `{ id, netCents,
 * orphan }` triples that the server action persists in one
 * transactional update. The function is PURE — same input, same
 * output, zero IO — so it can be node-tested.
 *
 * Net rules (matches Story 1.5 contract):
 *   - Parent (claimable, non-IRC):  net = gross + Σ(child IRC gross)
 *   - Normal product (no children):  net = gross
 *   - IRC line:                      net = own gross (negative)
 *   - Orphan IRC:                    net = own gross; orphan := true
 *
 * Conservation: Σ net over all lines equals Σ gross (folding moves
 * the IRC amount into the parent's net; the IRC's own net is its
 * own amount, but the parent now carries it too — only correct if
 * we measure conservation as Σ gross. The page-level `parsedSum =
 * Σ gross` derivation (1.5 AC6) is untouched.)
 */

export interface RecomputeInputLine {
  id: string;
  grossCents: number;
  isIrc: boolean;
  /** For IRC lines: id of the new/intended parent; null = orphan. */
  ircAttributedTo: string | null;
}

export interface RecomputeOutputLine {
  id: string;
  netCents: number;
  /** For IRC lines only — recomputed against the new parent set. */
  orphan: boolean;
}

export function recomputeNets(
  lines: RecomputeInputLine[],
): RecomputeOutputLine[] {
  // Index IRC sums by parent id.
  const ircSumByParent = new Map<string, number>();
  // Track which IRCs point at parents that exist AND are non-IRC.
  const parentIds = new Set<string>();
  for (const l of lines) {
    if (!l.isIrc) parentIds.add(l.id);
  }

  for (const l of lines) {
    if (!l.isIrc) continue;
    if (l.ircAttributedTo && parentIds.has(l.ircAttributedTo)) {
      ircSumByParent.set(
        l.ircAttributedTo,
        (ircSumByParent.get(l.ircAttributedTo) ?? 0) + l.grossCents,
      );
    }
  }

  return lines.map((l) => {
    if (l.isIrc) {
      const orphan =
        l.ircAttributedTo === null || !parentIds.has(l.ircAttributedTo);
      return { id: l.id, netCents: l.grossCents, orphan };
    }
    const childSum = ircSumByParent.get(l.id) ?? 0;
    return {
      id: l.id,
      netCents: l.grossCents + childSum,
      orphan: false,
    };
  });
}
