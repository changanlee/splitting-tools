/**
 * Story 2.1 — 付款人核對閘門 page (FR8).
 *
 * Server Component (Next 16 default). Reads receipt_lines + sessions
 * server-side, computes the three-state reconciliation, and renders
 * the StickySubtotalBar + readonly ReceiptLineRow list. Zero client
 * island in 2-1; later stories add interactivity per their scope
 * (2-2 locate, 2-3 edit, 2-4 IRC rebind, 2-5 manual total, 2-6/2-7
 * force-pass / never-deadlock).
 *
 * ctx.params is a Promise in Next 16 — sticking with 1-3/1-7 pattern.
 */
import { notFound } from "next/navigation";

import { computeReconciliation } from "@/features/reconciliation/compute";
import { ReceiptLineRow } from "@/features/reconciliation/components/ReceiptLineRow";
import { StickySubtotalBar } from "@/features/reconciliation/components/StickySubtotalBar";
import { getReconciliationSummary } from "@/features/reconciliation/server/summary";

interface Ctx {
  params: Promise<{ linkId: string }>;
}

export default async function ReviewPage({ params }: Ctx) {
  const { linkId } = await params;

  let summary: Awaited<ReturnType<typeof getReconciliationSummary>>;
  try {
    summary = await getReconciliationSummary(linkId);
  } catch (e) {
    // NFR-R1: never leak raw DB/system errors to the user.
    console.error(
      "[review] getReconciliationSummary failed:",
      e instanceof Error ? e.message : String(e),
    );
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">核對閘門</h1>
        <p className="text-sm text-muted-foreground">
          暫時無法載入對帳結果，請稍後再試。
        </p>
      </main>
    );
  }

  if (!summary) {
    // Session does not exist — 404. Full link semantics = Story 3.1;
    // device-token authz = Epic 4. v1 only checks existence.
    notFound();
  }

  // AC3 ②: parse hasn't produced rows yet (queued/processing/failed,
  // or succeeded with no lines). Don't render the SubtotalBar three
  // states — that would imply a baseline to compare against.
  if (summary.lines.length === 0) {
    return (
      <main className="min-h-dvh px-4 py-8 max-w-md mx-auto">
        <h1 className="text-lg font-semibold mb-2">核對閘門</h1>
        <p className="text-sm text-muted-foreground">
          解析尚未完成或尚無逐行品項，請回到上一頁繼續等待。
        </p>
      </main>
    );
  }

  const reconciliation = computeReconciliation(
    summary.parsedSumCents,
    summary.printedTotalCents,
  );

  return (
    <main className="min-h-dvh max-w-md mx-auto flex flex-col">
      <StickySubtotalBar
        parsedSumCents={summary.parsedSumCents}
        reconciliation={reconciliation}
      />
      <h1 className="px-4 pt-4 pb-2 text-base font-semibold">
        核對逐行品項
      </h1>
      <ol className="flex-1" aria-label="收據逐行品項">
        {summary.lines.map((l) => (
          <ReceiptLineRow key={l.id} line={l} />
        ))}
      </ol>
      <footer className="px-4 py-4 text-xs text-muted-foreground border-t">
        Story 2.1 顯示 only。可疑行（2-2）／編輯增刪（2-3）／IRC 改綁（2-4）／
        手動印製總額（2-5）／未驗證放行（2-6）／前進保證（2-7）由後續 story 接續。
      </footer>
    </main>
  );
}
