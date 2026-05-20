/**
 * Story 5.5 — freeze gate. Pure helper consumed by claim/review
 * pages + claim-mutation server actions to refuse writes once the
 * session is finalized (NFR-S5 readonly).
 */
export function isFrozen(status: string): boolean {
  return status === "finalized";
}

export const FRIENDLY_FROZEN = "這次分帳已定案，不能再修改。";
