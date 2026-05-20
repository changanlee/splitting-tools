/**
 * Story 2.6 — 「未驗證強制放行」 escape hatch (FR14).
 *
 * Two-step confirm to prevent accidental clicks: the outer summary
 * expands a form whose submit explicitly carries `confirmed=yes`. The
 * action rejects anything else. UX spec L524 requires "Dialog 二次確
 * 認 + 明示後果"; without a client island, a native <details>
 * combined with the explicit hidden confirmed value is the
 * progressive-enhancement equivalent: the user must (a) expand, (b)
 * submit.
 *
 * Also exposes an "undo" submit when already unverified, so the
 * payer can recover.
 */
import { forcePassUnverifiedAction } from "@/features/reconciliation/server/actions";

interface Props {
  linkId: string;
  currentlyUnverified: boolean;
}

export function ForcePassForm({ linkId, currentlyUnverified }: Props) {
  const bound = forcePassUnverifiedAction.bind(null, linkId);

  if (currentlyUnverified) {
    return (
      <form
        action={bound}
        className="border-t border-border px-4 py-3 text-sm flex items-center gap-3"
      >
        <input type="hidden" name="confirmed" value="undo" />
        <span className="flex-1 text-amber-700 dark:text-amber-300">
          此分帳目前已未驗證放行。
        </span>
        <button
          type="submit"
          className="rounded border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          取消未驗證狀態
        </button>
      </form>
    );
  }

  return (
    <details className="border-t border-border">
      <summary className="px-4 py-3 cursor-pointer text-sm font-medium hover:bg-accent/50">
        🚪 未驗證強制放行（無法對帳時的逃生口）
      </summary>
      <form action={bound} className="px-4 py-3 flex flex-col gap-2 text-sm">
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          確認後分帳將標記為「未經對帳驗證」，所有認領者頁面都會看到此警示
          （FR15）。請確認真的無法對齊金額再放行。
        </p>
        <input type="hidden" name="confirmed" value="yes" />
        <button
          type="submit"
          className="self-start rounded bg-amber-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-amber-700"
        >
          確認未驗證放行
        </button>
      </form>
    </details>
  );
}
