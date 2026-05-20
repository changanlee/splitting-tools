/**
 * Story 2.6 — 「未經對帳驗證」banner (FR15) shown on every claimant /
 * payer page whenever sessions.unverified=true. Same component is
 * re-used by Epic 4 claim/board surfaces (UX spec L544-545); kept in
 * the reconciliation feature folder because it's the reconciliation
 * state that owns the flag.
 *
 * UX (per spec L520): amber, ⚠ icon, declarative text. Server
 * Component — no client state, no interactivity.
 */

export function UnverifiedBanner({ unverified }: { unverified: boolean }) {
  if (!unverified) return null;
  return (
    <div
      role="status"
      className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      data-unverified="true"
    >
      ⚠ 這次分帳的解析結果未經對帳驗證，付款人選擇了「未驗證強制放行」。請小心核對金額。
    </div>
  );
}
